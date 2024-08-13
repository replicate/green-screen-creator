<template lang="pug">
.mx-auto.px-4.max-w-5xl(
  class="sm:pb-16 md:pb-24 sm:px-6 lg:px-8"
)
  .text-center(
    class="sm:pb-12 md:pb-20"
  )
    h1.text-4xl.font-bold.tracking-tight.text-gray-900(
      class="sm:text-6xl"
    ) Demos
  video.w-full.rounded-2xl(
    controls
    crossorigin="anonymous"
  )
    source(src="/demo.mp4")
</template>

<script>
export default {
  name: 'Demo'
}
</script>

<style lang="stylus" scoped></style>
