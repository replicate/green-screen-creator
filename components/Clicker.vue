<template lang="pug">
u-card(
  :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }"
)
  template(#header)
    .flex.items-center.justify-between
      h3.text-base.font-semibold.leading-6.text-gray-900(
        class="dark:text-white"
      ) Click on objects to track
      u-button(
        @click="$emit('reset')"
        :disabled="loading"
        color="gray"
        variant="ghost"
        icon="i-heroicons-x-mark-20-solid"
        class="-my-1"
      )
  .relative
    div.w-full.aspect-1.bg-contain.bg-center.bg-no-repeat.bg-black.cursor-pointer(
      @mousemove="onMouseMove"
      @mousedown="onMouseDown"
      @contextmenu="(e) => e.preventDefault()"
      ref="container"
    )
      canvas.absolute.w-full.h-full.pointer-events-none.opacity-60(ref="maskCanvas")
    .hidden
      img.icon(
        ref="starIcon"
        src="/star-icon.png"
      )
      img.icon(
        ref="crossIcon"
        src="/cross-icon.png"
      )
  .pt-6.text-sm.grid.grid-cols-3
    .flex.items-center
      u-kbd(
        value="Left click = retain"
      )
    u-divider(orientation="vertical")
    .flex.items-center
      u-kbd(
        value="Right click = green screen"
      )
  template(#footer)
    .flex
      u-button(
        @click="reset"
        :disabled="loading"
        color="red"
        variant="link"
      ) Clear Points
      .grow
      u-button(
        @click="submit"
        :loading="loading"
        :disabled="false"
        color="black"
      ) Submit
</template>

<script>
import {
  SamModel,
  AutoProcessor,
  RawImage,
  Tensor
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.5'

const model_id = 'Xenova/slimsam-77-uniform'

// Clamp a value inside a range [min, max]
const clamp = (x, min = 0, max = 1) => {
  return Math.max(Math.min(x, max), min)
}

export default {
  name: 'Clicker',
  props: ['image', 'loading'],
  data: () => ({
    mask_ctx: null,

    model: null,
    processor: null,

    is_decoding: false,
    decode_pending: false,

    last_points: null,
    image_embeddings: null,
    is_multi_mask_mode: false,

    image_processed: null,
    image_embeddings: null
  }),
  methods: {
    async decode() {
      // Only proceed if we are not already decoding
      if (this.is_decoding) {
        this.decode_pending = true
        return
      }
      this.is_decoding = true

      // Prepare inputs for decoding
      const reshaped = this.image_processed.reshaped_input_sizes[0]
      const points = this.last_points
        .map((x) => [x.position[0] * reshaped[1], x.position[1] * reshaped[0]])
        .flat(Infinity)
      const labels = this.last_points.map((x) => BigInt(x.label)).flat(Infinity)

      const num_points = this.last_points.length
      const input_points = new Tensor('float32', points, [1, 1, num_points, 2])
      const input_labels = new Tensor('int64', labels, [1, 1, num_points])

      // Generate the mask
      const { pred_masks, iou_scores } = await this.model({
        ...this.image_embeddings,
        input_points,
        input_labels
      })

      // Post-process the mask
      const masks = await this.processor.post_process_masks(
        pred_masks,
        this.image_processed.original_sizes,
        this.image_processed.reshaped_input_sizes
      )

      this.is_decoding = false

      this.updateMaskOverlay(RawImage.fromTensor(masks[0][0]), iou_scores.data)

      // Check if another decode is pending
      if (this.decode_pending) {
        this.decode_pending = false
        this.decode()
      }
    },
    updateMaskOverlay(mask, scores) {
      // Update canvas dimensions (if different)
      if (
        this.$refs.maskCanvas.width !== mask.width ||
        this.$refs.maskCanvas.height !== mask.height
      ) {
        this.$refs.maskCanvas.width = mask.width
        this.$refs.maskCanvas.height = mask.height
      }

      // Allocate buffer for pixel data
      const imageData = this.mask_ctx.createImageData(
        this.$refs.maskCanvas.width,
        this.$refs.maskCanvas.height
      )

      // Select best mask
      const numMasks = scores.length // 3
      let bestIndex = 0
      for (let i = 1; i < numMasks; ++i) {
        if (scores[i] > scores[bestIndex]) {
          bestIndex = i
        }
      }

      // Fill mask with colour
      const pixelData = imageData.data
      for (let i = 0; i < pixelData.length; ++i) {
        if (mask.data[numMasks * i + bestIndex] === 1) {
          const offset = 4 * i
          pixelData[offset] = 0 // red
          pixelData[offset + 1] = 114 // green
          pixelData[offset + 2] = 189 // blue
          pixelData[offset + 3] = 255 // alpha
        }
      }

      // Draw image data to context
      this.mask_ctx.putImageData(imageData, 0, 0)
    },
    async segment(url) {
      const imageInput = await RawImage.fromURL(url)

      // Update UI
      this.$refs.container.style.backgroundImage = `url(${url})`

      // Recompute image embeddings
      this.image_processed = await this.processor(imageInput)
      this.image_embeddings = await this.model.get_image_embeddings(
        this.image_processed
      )
    },
    getPoint(e) {
      // Get bounding box
      const bb = this.$refs.container.getBoundingClientRect()

      // Get the mouse coordinates relative to the container
      const mouseX = clamp((e.clientX - bb.left) / bb.width)
      const mouseY = clamp((e.clientY - bb.top) / bb.height)

      return {
        position: [mouseX, mouseY],
        label:
          e.button === 2 // right click
            ? 0 // negative prompt
            : 1 // positive prompt
      }
    },
    onMouseMove(e) {
      // Ignore mousemove events if the image is not encoded yet,
      // or we are in multi-mask mode
      if (!this.image_embeddings || this.is_multi_mask_mode) {
        return
      }
      this.last_points = [this.getPoint(e)]

      this.decode()
    },
    onMouseDown(e) {
      if (this.loading) {
        return
      }

      // Ignore other buttons
      if (e.button !== 0 && e.button !== 2) {
        return
      }

      // Ignore if not encoded yet
      if (!this.image_embeddings) {
        return
      }

      if (!this.is_multi_mask_mode) {
        this.last_points = []
        this.is_multi_mask_mode = true
      }

      const point = this.getPoint(e)
      this.last_points.push(point)

      // add icon
      const icon = (
        point.label === 1 ? this.$refs.starIcon : this.$refs.crossIcon
      ).cloneNode()
      icon.style.left = `${point.position[0] * 100}%`
      icon.style.top = `${point.position[1] * 100}%`
      this.$refs.container.appendChild(icon)

      // Run decode
      this.decode()
    },
    reset() {
      // Reset state
      this.is_multi_mask_mode = false
      this.last_points = null

      // Remove points from previous mask (if any)
      document.querySelectorAll('.icon').forEach((e) => e.remove())

      // Reset mask canvas
      this.mask_ctx.clearRect(
        0,
        0,
        this.$refs.maskCanvas.width,
        this.$refs.maskCanvas.height
      )
    },
    submit() {
      // Convert points to coordinates
      const original = this.image_processed.original_sizes[0]
      const clicks = this.last_points.map((x) => ({
        coordinates: [
          parseInt(x.position[0] * original[1]),
          parseInt(x.position[1] * original[0])
        ],
        label: x.label
      }))

      this.$emit('submit', clicks)
    }
  },
  async mounted() {
    this.mask_ctx = this.$refs.maskCanvas.getContext('2d')
    this.model = await SamModel.from_pretrained(model_id, {
      dtype: 'fp16', // or "fp32"
      device: 'webgpu'
    })
    this.processor = await AutoProcessor.from_pretrained(model_id)
    this.segment(this.image)
  }
}
</script>

<style lang="stylus" scoped>
div
  .icon
    width 16px
    height 16px
    position absolute
    transform translate(-50%, -50%)
</style>
