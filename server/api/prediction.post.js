export default defineEventHandler(async (event) => {
  try {
    const { api_token, version, input } = await readBody(event)

    const result = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api_token}`
      },
      body: JSON.stringify({
        version,
        input
      })
    })

    const json = await result.json()

    return { data: json }
  } catch (e) {
    console.log('--- error (api/prediction): ', e)

    return {
      error: e.message
    }
  }
})
