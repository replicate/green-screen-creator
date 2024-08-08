export default defineEventHandler(async (event) => {
  try {
    const { api_token, id } = getQuery(event)

    const result = await fetch(
      `https://api.replicate.com/v1/predictions/${id}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${api_token}`
        }
      }
    )

    const json = await result.json()

    // Remove potentially long data
    delete json.logs

    return { data: json }
  } catch (e) {
    console.log('--- error (api/prediction): ', e)

    return {
      error: e.message
    }
  }
})
