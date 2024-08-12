<template lang="pug">
.mx-auto.px-4.max-w-5xl(
  class="sm:pb-16 md:pb-24 sm:px-6 lg:px-8"
)
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
