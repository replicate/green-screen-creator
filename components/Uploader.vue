<template lang="pug">
#uploader.mx-auto.pb-8.px-4.max-w-5xl.grid.grid-cols-1.gap-8(
  v-if="api_token"
  class="sm:pb-16 md:pb-24 sm:px-6 lg:px-8 sm:gap-y-24 md:grid-cols-2"
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
    clicker(
      @submit="submit"
      @reset="modal = false; reset();"
      :image="input_video_first_frame"
      :loading="loading_upload"
    )

  div
    //- File upload
    template(v-if="input_method === 'file'")
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
      .text-center.my-4(v-else)
        u-button(
          @click="input_method = 'url'"
          icon="i-heroicons-link"
          variant="link"
          color="black"
        ) or paste an URL of a video file

    //- URL upload
    template(v-if="input_method === 'url'")
      .upload-button.relative.overflow-hidden.w-full.flex.flex-col.gap-4.justify-center.items-center.text-center.rounded-2xl.aspect-1.text-2xl(
        class="bg-gray-100"
      )
        u-input(
          v-model="input_video_url"
          @keydown.enter="onClickSelectUrl"
          :disabled="loading_file"
          class="w-9/12"
          size="xl"
          placeholder="https://"
          autofocus
        )
        u-button(
          @click="onClickSelectUrl"
          :loading="loading_file"
          class="w-9/12"
          size="xl"
          color="black"
          block
        ) Upload
      .text-center.my-4
        u-button(
          @click="input_method = 'file'"
          icon="i-heroicons-arrow-up-tray"
          variant="link"
          color="black"
        ) or upload a file from your computer

  div.space-y-4
    template(v-if="loading_prediction")
      template(v-if="!output_video")
        u-divider.mb-4(
          v-if="status"
          :label="status"
          type="dashed"
        )
        u-alert.mb-4(
          title="The selected object in the video is being tracked"
          description="This is done by the SAM 2 model that is running on Replicate."
          icon="i-heroicons-video-camera"
          :actions="[{ variant: 'solid', color: 'primary', label: 'Run SAM 2 with an API', icon: 'i-heroicons-arrow-top-right-on-square', trailing: true, click: openUrl }]"
          color="primary"
          variant="soft"
        )
      video.w-full.bg-black.aspect-1.rounded-2xl(
        v-else
        controls
        crossorigin="anonymous"
      )
        source(:src="output_video")
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

const extractFirstFrame = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous' // Enable CORS access
    video.src = videoUrl

    // Load metadata first
    video.addEventListener('loadedmetadata', () => {
      // Set a small currentTime to grab the first frame
      video.currentTime = 0.01
    })

    video.addEventListener('seeked', () => {
      // Video has seeked to the required time
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/jpeg')
      resolve(dataUrl)

      // Clean up
      video.src = ''
    })

    video.addEventListener('error', (e) => {
      reject(new Error(`Video error: ${video.error.message}`))
    })

    // Start loading the video
    video.load()
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
    loading_prediction: false,

    input_method: 'file',

    input_video_base64: null,
    input_video_object_url: null,
    input_video_first_frame: null,
    input_video_framerate: null,
    input_video_file_url: null,
    input_video_url: null,

    output_video: null,

    clicks: null,

    modal: false,
    status: null
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
      this.loading_prediction = false

      this.input_video_base64 = null
      this.input_video_object_url = null
      this.input_video_first_frame = null
      this.input_video_framerate = null
      this.input_video_file_url = null

      this.output_video = null
      this.clicks = null

      this.status = null

      this.$refs.file.value = null
    },
    onClickSelect() {
      if (!this.api_token || this.loading_prediction) return
      this.$refs.file.click()
    },
    onClickSelectUrl() {
      if (!this.api_token || this.loading_prediction || !this.input_video_url)
        return
      this.onUrlSelected()
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

        // Convert the input video to MP4 with max 512x512 size
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
          'scale=w=512:h=512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,setsar=1:1', // Scale and pad to 512x512
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

        // Extract only the first frame as JPEG
        await ffmpeg.run(
          '-i',
          'output.mp4',
          '-vf',
          'select=eq(n\\,0)', // Note the double backslash
          '-vframes',
          '1',
          '-q:v',
          '2',
          'first_frame.jpg'
        )

        // Read the converted MP4 file
        const mp4Data = ffmpeg.FS('readFile', 'output.mp4')

        // Create Blob from the MP4 data
        const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' })

        // Convert MP4 to base64
        const videoBase64 = await blobToBase64(mp4Blob)

        this.input_video_base64 = videoBase64
        this.input_video_object_url = URL.createObjectURL(mp4Blob)

        // Read first frame and convert to base64
        const frameData = ffmpeg.FS('readFile', 'first_frame.jpg')
        const frameBlob = new Blob([frameData.buffer], {
          type: 'image/jpeg'
        })
        this.input_video_first_frame = await blobToBase64(frameBlob)

        this.modal = true
        this.loading_file = false
      } catch (e) {
        console.log('--- error (onFileSelected):', e.message)
      } finally {
        // Clean up FFmpeg file system
        try {
          ffmpeg.FS('unlink', 'input_video')
          ffmpeg.FS('unlink', 'output.mp4')
          ffmpeg.FS('unlink', 'first_frame.jpg')
        } catch (e) {
          console.error('Error cleaning up FFmpeg file system:', e)
        }
      }
    },
    async onUrlSelected(e) {
      this.reset()
      this.loading_file = true

      try {
        this.input_video_first_frame = await extractFirstFrame(
          this.input_video_url
        )

        this.modal = true
        this.loading_file = false
      } catch (e) {
        console.log('--- error (onFileSelected):', e)
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
    async submit(clicks) {
      this.loading_upload = true
      this.clicks = clicks

      try {
        // Wait for video upload to complete
        if (!this.input_video_url) {
          const [input_video_file_url] = await Promise.all([
            this.createFile('input_video.mp4', this.input_video_base64)
          ])

          this.input_video_file_url = input_video_file_url

          // Just use the provided URL
        } else {
          this.input_video_file_url = this.input_video_url
        }

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
      this.loading_prediction = true

      try {
        // SAM 2
        // https://replicate.com/meta/sam-2-video
        this.status = 'Tracking: starting'

        const click_coordinates = this.clicks
          .map(({ coordinates }) => `[${coordinates[0]},${coordinates[1]}]`)
          .join(',')
        const click_labels = this.clicks.map(({ label }) => label).join(',')
        const click_frames = this.clicks.map((x) => '1').join(',')
        const click_object_ids = this.clicks.map((x, i) => i + 1).join(',')

        const prediction = await this.createPrediction(
          '33432afdfc06a10da6b4018932893d39b0159f838b6d11dd1236dff85cc5ec1d',
          {
            input_video: this.input_video_file_url,
            click_coordinates,
            click_labels,
            click_frames,
            click_object_ids,
            mask_type: 'greenscreen',
            output_video: true,
            video_fps: parseInt(this.input_video_framerate),
            output_format: 'webp',
            output_quality: 80,
            output_frame_interval: 1
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
        this.output_video = prediction.output[0]

        console.log('prediction', prediction)
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
      poll_interval = 3000
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
    },
    openUrl() {
      window.open('https://replicate.com/meta/sam-2-video', '_blank')
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
