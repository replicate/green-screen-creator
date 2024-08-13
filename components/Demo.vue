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
  video.w-full.rounded-2xl.mt-12(
    v-for="(demo, i) in demos"
    :key="`demo-${i}`"
    crossorigin="anonymous"
    controls
  )
    source(:src="`/demo/${demo}.mp4`")
</template>

<script>
export default {
  name: 'Demo',
  data: () => ({
    demos: ['dog', 'bees', 'jellyfish', 'fountain']
  })
}
</script>

<style lang="stylus" scoped></style>
