export default defineEventHandler(async (event) => {
  try {
    const { api_token, file_name, data } = await readBody(event)

    // Extract the base64 data from the data URI
    const base64Data = data.split(',')[1]

    // Decode base64 to a Uint8Array
    const uint8Array = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))

    // Create a Blob from the Uint8Array
    const blob = new Blob([uint8Array], { type: 'application/octet-stream' })

    // Create form data
    const form = new FormData()
    form.append('content', blob, file_name)

    // Upload the file data to Replicate's file storage
    const result = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api_token}`
      },
      body: form
    })

    const json = await result.json()

    return { data: json.urls.get }
  } catch (e) {
    console.log('--- error (api/prediction): ', e)

    return {
      error: e.message
    }
  }
})
