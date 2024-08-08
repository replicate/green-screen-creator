<template lang="pug">
#uploader.mx-auto.mb-8.px-4.max-w-5xl.grid.grid-cols-1.gap-8(
  v-if="api_token"
  class="sm:mb-16 md:mb-24 sm:px-6 lg:px-8 sm:gap-y-24 md:grid-cols-2"
)
  //- Hidden input
  input(
    @change="onFileSelected"
    type="file"
    ref="file"
    accept="video/*"
  )

  //- First-frame modal
  u-modal(
    v-model="modal"
    prevent-close
  )
    u-card(
      :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }"
    )
      template(#header)
        .flex.items-center.justify-between
          h3.text-base.font-semibold.leading-6.text-gray-900(
            class="dark:text-white"
          ) Click on an object to track and inpaint
      .relative.inline-block
        img.cursor-pointer(
          v-if="input_video_frames.length > 0"
          @click="onImageClicked"
          :src="input_video_frames[0]"
          class="max-w-full max-h-[70vh]"
          ref="firstFrameImage"
        )
        .absolute.pointer-events-none(
          v-if="crosshair_position" 
          :style="{ left: `${crosshair_position.x}px`, top: `${crosshair_position.y}px` }"
        )
          .w-6.h-6.border-2.border-red-500.rounded-full.flex.items-center.justify-center(
            class="-ml-3 -mt-3"
          )
            .w-1.h-1.bg-red-500.rounded-full
        u-form-group.mt-4(
          label="Inpainter prompt"
          size="xl"
        )
          u-input(
            v-model="prompt"
            size="xl"
            placeholder="Prompt"
            icon="i-heroicons-chat-bubble-bottom-center-text"
          )
      template(#footer)
        .flex
          u-button(
            @click="modal = false; reset();"
            color="red"
            variant="link"
          ) Cancel
          .grow
          u-button(
            @click="submit"
            :loading="loading_upload"
            :disabled="!selected_coordinates"
            color="black"
          ) Submit

  div
    .upload-button.relative.overflow-hidden.w-full.flex.flex-col.gap-4.justify-center.items-center.text-center.cursor-pointer.rounded-2xl.aspect-1.text-2xl(
      @click="onClickSelect"
      class="bg-gray-100 hover:bg-[#dddddd]"
    )
      template(v-if="input_video_object_url")
        .preview
          video.w-full.h-full.bg-black(controls)
            source(:src="input_video_object_url")
      template(v-else)
        template(v-if="loading_file")
          u-progress(
            :ui="{ wrapper: 'w-9/12' }"
            animation="swing"
          )
        template(v-else)
          u-icon.icon(
            name="i-heroicons-arrow-up-tray"
          )
          span Upload a video
    .text-center.my-4(v-if="input_video_object_url")
      u-button(
        @click="reset"
        icon="i-heroicons-trash"
        variant="link"
        color="black"
      )
  div.space-y-4
    u-tabs(
      v-if="show_tabs"
      v-model="selected_tab"
      :items="tab_items"
    )
      template(#default="{ item, index, selected }")
        span.truncate(
          :class="[selected && 'text-primary-500 dark:text-primary-400']"
        ) {{ index + 1 }}. {{ item.label }}
      template(#item="{ item }")
        u-divider.my-4(
          v-if="status"
          :label="status"
          type="dashed"
        )
        u-alert.mb-4(
          :title="item.alertTitle"
          :description="item.alertContent"
          :icon="item.alertIcon"
          :actions="item.alertActions"
          color="primary"
          variant="soft"
        )
        video.w-full.bg-black(
          v-if="output_video_mask && !output_video_inpainted"
          controls
        )
          source(:src="output_video_mask")
        video.w-full.bg-black(
          v-if="output_video_inpainted"
          controls
        )
          source(:src="output_video_inpainted")
</template>

<script>
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'
import { useLocalStorage } from '@vueuse/core'

// Logs are used to capture frame rate
let ffmpeg_logs = ''

const ffmpeg = createFFmpeg({
  log: true,
  logger: ({ message }) => {
    ffmpeg_logs += message + '\n'
  }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const blobToBase64 = (blob) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export default {
  name: 'Uploader',
  setup: () => ({
    api_token: useLocalStorage('inpainter-video-api-token', null)
  }),
  data: () => ({
    loading_file: false,
    loading_upload: false,

    input_video_base64: null,
    input_video_object_url: null,
    input_video_frames: [],
    input_video_framerate: null,
    input_video_file_url: null,

    crosshair_position: null,
    selected_coordinates: null,
    frame_image_natural_size: { width: 0, height: 0 },

    prompt: 'green jungle plants',

    modal: false,

    show_tabs: false,
    selected_tab: 0,

    status: null,

    output_video_mask: null,
    output_video_inpainted: null,

    tab_items: [
      {
        label: 'Track object',
        disabled: false,
        alertIcon: 'i-heroicons-video-camera',
        alertTitle: 'The selected object in the video is being tracked',
        alertContent:
          'This is done by the SAM 2 model that is running on Replicate.',
        alertActions: [
          {
            variant: 'solid',
            color: 'primary',
            label: 'Run SAM 2 with an API',
            icon: 'i-heroicons-arrow-top-right-on-square',
            trailing: true,
            click: () => {
              window.open('https://replicate.com/meta/sam-2', '_blank')
            }
          }
        ]
      },
      {
        label: 'Inpaint',
        disabled: false,
        alertIcon: 'i-heroicons-paint-brush',
        alertTitle: 'Every frame is inpainted using the prompt',
        alertContent:
          'This is done by the Stable Diffusion model that is running on Replicate.',
        alertActions: [
          {
            variant: 'solid',
            color: 'primary',
            label: 'Run Stable Diffusion with an API',
            icon: 'i-heroicons-arrow-top-right-on-square',
            trailing: true,
            click: () => {
              window.open(
                'https://replicate.com/stability-ai/stable-diffusion-inpainting',
                '_blank'
              )
            }
          }
        ]
      }
    ]
  }),
  watch: {
    modal(val) {
      if (!val) return

      this.$nextTick(() => {
        const img = this.$refs.firstFrameImage
        if (img) {
          this.frame_image_natural_size = {
            width: img.naturalWidth,
            height: img.naturalHeight
          }
        }
      })
    }
  },
  methods: {
    reset() {
      this.loading_file = false
      this.loading_upload = false

      this.input_video_base64 = null
      this.input_video_object_url = null
      this.input_video_frames = []
      this.input_video_framerate = null
      this.input_video_file_url = null
      this.crosshair_position = null
      this.selected_coordinates = null

      this.prompt = 'green jungle plants'

      this.show_tabs = false
      this.selected_tab = 0

      this.status = null

      this.output_video_mask = null
      this.output_video_inpainted = null

      this.$refs.file.value = null
    },
    onClickSelect() {
      if (!this.api_token || this.show_tabs) return
      this.$refs.file.click()
    },
    async onFileSelected(e) {
      this.loading_file = true

      try {
        const file = e.target.files[0]

        // Make sure ffmpeg is loaded
        if (!ffmpeg.isLoaded()) {
          await ffmpeg.load()
        }

        // Write the file to FFmpeg's file system
        ffmpeg.FS('writeFile', 'input_video', await fetchFile(file))

        // Convert the input video to MP4 with max 480x480 size
        await ffmpeg.run(
          '-i',
          'input_video',
          '-c:v',
          'libx264', // Use H.264 codec for video
          '-c:a',
          'aac', // Use AAC codec for audio
          '-strict',
          'experimental', // Needed for some FFmpeg versions
          '-b:a',
          '192k', // Audio bitrate
          '-vf',
          'scale=w=480:h=480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2,setsar=1:1', // Scale and pad to 480x480
          '-pix_fmt',
          'yuv420p', // Ensure video compatibility
          '-color_range',
          '1', // Force full color range (0-255)
          '-colorspace',
          'bt709', // Use BT.709 color space (standard for HD)
          '-color_trc',
          'bt709',
          '-color_primaries',
          'bt709',
          'output.mp4'
        )

        // Extract framerate
        ffmpeg_logs = ''
        await ffmpeg.run('-i', 'output.mp4', '-f', 'null', '-')
        const fpsMatch = ffmpeg_logs.match(/(\d+(?:\.\d+)?) fps/)
        this.input_video_framerate = fpsMatch ? parseFloat(fpsMatch[1]) : null

        // Extract all frames as JPEG
        await ffmpeg.run(
          '-i',
          'output.mp4',
          '-vf',
          'fps=' + this.input_video_framerate,
          '-q:v',
          '2', // JPEG quality (2-31, lower is better quality)
          'frame_%d.jpg'
        )

        // Read the converted MP4 file and the thumbnail
        const mp4Data = ffmpeg.FS('readFile', 'output.mp4')

        // Create Blob from the MP4 data
        const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' })

        // Convert MP4 to base64
        const videoBase64 = await blobToBase64(mp4Blob)

        this.input_video_base64 = videoBase64
        this.input_video_object_url = URL.createObjectURL(mp4Blob)

        // Read all frames and convert to base64
        this.input_video_frames = []
        let frameIndex = 1
        while (true) {
          try {
            const frameData = ffmpeg.FS('readFile', `frame_${frameIndex}.jpg`)
            const frameBlob = new Blob([frameData.buffer], {
              type: 'image/jpeg'
            })
            const frameBase64 = await blobToBase64(frameBlob)
            this.input_video_frames.push(frameBase64)
            frameIndex++
          } catch (error) {
            // No more frames to read
            break
          }
        }

        this.modal = true
        this.loading_file = false
      } catch (e) {
        console.log('--- error (onFileSelected):', e.message)
      } finally {
        // Clean up FFmpeg file system
        try {
          ffmpeg.FS('unlink', 'input_video')
          ffmpeg.FS('unlink', 'output.mp4')
          for (let i = 1; i <= this.input_video_frames.length; i++) {
            ffmpeg.FS('unlink', `frame_${i}.jpg`)
          }
        } catch (e) {
          console.error('Error cleaning up FFmpeg file system:', e)
        }
      }
    },
    onImageClicked(e) {
      const rect = e.target.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      this.crosshair_position = { x, y }

      // Calculate the coordinates relative to the natural image size
      const scaleX = this.frame_image_natural_size.width / rect.width
      const scaleY = this.frame_image_natural_size.height / rect.height

      this.selected_coordinates = {
        x: Math.round(x * scaleX),
        y: Math.round(y * scaleY)
      }
    },
    async createVideoFromFrames(frames = []) {
      try {
        if (!frames || frames.length <= 0) {
          throw new Error('missing frames')
        }

        // Make mask video
        // Download and write each image to FFmpeg's virtual file system
        for (let i = 0; i < frames.length; i++) {
          const imageData = await fetchFile(frames[i])
          ffmpeg.FS('writeFile', `frame_${i}.png`, imageData)
        }

        // Run FFmpeg command to stitch images into a video
        await ffmpeg.run(
          '-framerate',
          this.input_video_framerate.toString(),
          '-i',
          'frame_%d.png',
          '-c:v',
          'libx264',
          '-r',
          this.input_video_framerate.toString(),
          '-pix_fmt',
          'yuv420p',
          'output.mp4'
        )

        // Read the result
        const data = ffmpeg.FS('readFile', 'output.mp4')

        return URL.createObjectURL(
          new Blob([data.buffer], { type: 'video/mp4' })
        )
      } catch (e) {
        console.log('--- error (createVideoFromFrames):', e.message)
        return null
      } finally {
        // Clean up FFmpeg file system
        try {
          for (let i = 0; i < frames.length; i++) {
            ffmpeg.FS('unlink', `frame_${i}.png`)
          }
          ffmpeg.FS('unlink', 'output.mp4')
        } catch (e) {
          console.error('Error cleaning up FFmpeg file system:', e)
        }
      }
    },
    async submit() {
      this.loading_upload = true

      try {
        // Wait for video upload to complete
        const [input_video_file_url] = await Promise.all([
          this.createFile('input_video.mp4', this.input_video_base64)
        ])

        this.input_video_file_url = input_video_file_url

        // Close modal and end loading
        this.modal = false

        // Start pipeline
        this.pipeline()
      } catch (e) {
        console.log(e)
      } finally {
        this.loading_upload = false
      }
    },
    async pipeline() {
      this.show_tabs = true

      try {
        this.selected_tab = 0

        // SAM 2
        const prediction_sam2 = await this.createPrediction(
          'd0b79afbb65a1263ca382029ffa5886749b724963cf309de4a95a9f67e8022af',
          {
            video: this.input_video_file_url,
            clicks: `[${this.selected_coordinates.x},${this.selected_coordinates.y}]`,
            labels: '1',
            affected_frames: '0',
            ann_obj_ids: '1',
            vis_frame_stride: 1
          },
          (prediction) => {
            function getLastPercentage(logString) {
              const percentageRegex = /\s(\d+)%\|/g
              let lastMatch = null
              let match

              while ((match = percentageRegex.exec(logString)) !== null) {
                lastMatch = match
              }

              return lastMatch ? lastMatch[1] : 0
            }

            const status =
              prediction?.status === 'processing'
                ? `processing (${getLastPercentage(prediction?.logs)}%)`
                : prediction?.status

            this.status = `Tracking: ${status || 'starting'}`
          }
        )

        // Create mask video from frames
        this.status = 'Downloading video'
        const frames_highlighted = prediction_sam2?.output?.highlighted_frames
        const frames_mask = prediction_sam2?.output?.black_white_masks
        this.output_video_mask = await this.createVideoFromFrames(
          frames_highlighted
        )

        this.selected_tab = 1

        // Inpainter
        const batchInpaint = async (
          frames_mask,
          frames,
          batchSize,
          maxRetries = 3
        ) => {
          const inpainted_frames = []
          for (let i = 0; i < frames_mask.length; i += batchSize) {
            const batch = frames_mask.slice(i, i + batchSize)
            const batchFrames = frames.slice(i, i + batchSize)

            this.status = `Inpainting (${Math.ceil(
              (i / frames_mask.length) * 100
            )}%)`

            let retryCount = 0
            let batchResults

            while (retryCount <= maxRetries) {
              try {
                const batchPromises = batch.map((mask, index) =>
                  this.createPrediction(
                    '95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3',
                    {
                      prompt: this.prompt,
                      image: batchFrames[index],
                      mask,
                      width: 512,
                      height: 512,
                      num_outputs: 1,
                      num_inference_steps: 16,
                      guidance_scale: 9,
                      scheduler: 'K_EULER_ANCESTRAL',
                      disable_safety_checker: true // Cause of a lot of failures
                    },
                    (prediction) => {
                      console.log(
                        `--- debug (poll): frame ${i + index + 1} / ${
                          frames_mask.length
                        } (status: ${prediction.status})`
                      )
                    }
                  )
                )

                batchResults = await Promise.all(batchPromises)

                // Check if any prediction failed
                const failedPrediction = batchResults.find(
                  (prediction) => !prediction.output
                )

                if (failedPrediction) {
                  throw new Error('Batch prediction failed')
                }

                // If we reach here, all predictions were successful
                break
              } catch (error) {
                console.error(
                  `Batch processing failed. Retry ${
                    retryCount + 1
                  }/${maxRetries}`
                )
                retryCount++

                if (retryCount > maxRetries) {
                  console.error('Max retries reached. Skipping batch.')
                  batchResults = batch.map(() => ({ output: [null] }))
                }
              }
            }

            inpainted_frames.push(
              ...batchResults.map((prediction) => prediction.output[0])
            )
          }
          return inpainted_frames
        }

        this.status = 'Inpainting'

        // Usage
        const batchSize = 10 // Configurable batch size
        const maxRetries = 3 // Configurable max retries
        const inpainted_frames = await batchInpaint(
          frames_mask,
          this.input_video_frames,
          batchSize,
          maxRetries
        )

        console.log('inpainted_frames', inpainted_frames)
        this.status = 'Creating final video'

        // Create final video from inpainted frames
        this.output_video_inpainted = await this.createVideoFromFrames(
          inpainted_frames
        )
      } catch (e) {
        console.log('--- error (pipeline):', e.message)
      } finally {
        this.status = null
      }
    },

    async createFile(file_name, data) {
      try {
        const response = await $fetch('/api/file', {
          method: 'POST',
          body: {
            api_token: this.api_token,
            file_name,
            data
          }
        })

        return response.data
      } catch (e) {
        console.log('--- error (createFile):', e.message)
      }
    },
    async createPrediction(
      version,
      input,
      callback = () => {},
      poll_interval = 10000
    ) {
      try {
        const { data } = await $fetch('/api/prediction', {
          method: 'POST',
          body: {
            api_token: this.api_token,
            version,
            input
          }
        })

        let status = 'starting'
        let response = null

        // Poll
        while (status !== 'succeeded' && status !== 'failed') {
          response = await $fetch(
            `/api/prediction?api_token=${this.api_token}&id=${data?.id}`
          )
          callback(response.data)

          status = response.data.status
          if (status !== 'succeeded' && status !== 'failed') {
            await sleep(poll_interval)
          }
        }

        return response.data
      } catch (e) {
        console.log('--- error (createPrediction):', e.message)
      }
    }
  }
}
</script>

<style lang="stylus" scoped>
#uploader
  input[type="file"]
    display none

  .upload-button
    transition background 150ms ease-in-out

    .preview
      background-size cover
      background-position center
      position absolute
      bottom 0
      right 0
      left 0
      top 0

    .icon
      transition transform 150ms ease-in-out

    &:hover
      .icon
        transform translateY(-5px)
</style>
