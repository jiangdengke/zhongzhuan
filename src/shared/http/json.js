export async function readJsonBody(request) {
  try {
    return {
      ok: true,
      data: await request.json(),
    };
  } catch {
    return {
      ok: false,
      data: null,
    };
  }
}
