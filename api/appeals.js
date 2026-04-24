export default async function handler(req, res) {
  let all = [];
  let url = 'https://goadmin.ifrc.org/api/v2/appeal/?limit=500&atype=1&ordering=-start_date';
  while (url) {
    const r = await fetch(url, {
      headers: { Authorization: `Token ${process.env.IFRC_TOKEN}` },
    });
    const data = await r.json();
    all.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  res.json(all);
}
