<template lang="pug">
.pt-8.pb-8.px-4.relative(
  class="sm:pb-16 md:pb-24 sm:px-6 lg:px-8"
)

  //- API token modal
  u-modal(v-model="modal")
    u-card(
      :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }"
    )
      template(#header)
        .flex.items-center.justify-between
          h3.text-base.font-semibold.leading-6.text-gray-900(
            class="dark:text-white"
          ) Replicate API token
          u-button(
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark-20-solid"
            class="-my-1"
            @click="modal = false"
          )
      p.text-sm.text-gray-500(
        class="dark:text-gray-400"
      )
        | Provide your personal Replicate API token. We will store the token in your browser's 
        a(
          href="https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage"
          target="_blank"
        ) localstorage
        | , and use it to run machine learning models in the cloud.
      template(#footer)
        u-button(
          to="https://replicate.com/account/api-tokens"
          target="_blank"
          color="black"
          icon="i-heroicons-arrow-top-right-on-square"
          trailing
        ) My Replicate API tokens

  .mb-8.mx-auto.gap-4.flex.flex-row.max-w-5xl.items-center(
    class="sm:mb-16 md:mb-24"
  )
    img.max-h-8(src="/logo.png")
    .text-base(
      class="md:text-2xl"
    )
      span.text-primary green 
      | screen 
      span.text-primary creator
    .grow
    u-button(
      to="https://github.com/replicate/green-screen-creator"
      target="_blank"
      size="lg"
      icon="i-heroicons-code-bracket"
      variant="ghost"
    ) Get the Code
  .mx-auto.gap-16.flex.flex-col.max-w-4xl(
    class="sm:gap-y-24"
  )
    .text-center.relative
      h1.text-5xl.font-bold.tracking-tight.text-gray-900(
        class="dark:text-white sm:text-7xl"
      )
        span.text-primary Green 
        | Screen 
        span.text-primary Creator
      p.mt-6.mb-10.text-lg.tracking-tight.text-gray-600(
        class="dark:text-gray-100"
      )
        | Track an object in a video and add a green screen to the background.
      .flex.justify-center.space-x-2
        u-input(
          v-model="api_token"
          @keydown.enter=""
          size="xl"
          placeholder="Replicate API token"
          icon="i-heroicons-key"
          type="password"
        )
        u-button(
          @click=""
          :disabled="!api_token"
          size="xl"
          color="black"
        ) Set token
        u-button(
          @click="modal = true"
          icon="i-heroicons-question-mark-circle"
          variant="link"
          size="xl"
        )
</template>

<script>
import { useLocalStorage } from '@vueuse/core'

export default {
  name: 'Hero',
  setup: () => ({
    api_token: useLocalStorage('inpainter-video-api-token', null)
  }),
  data: () => ({
    modal: false
  })
}
</script>

<style lang="stylus" scoped></style>
