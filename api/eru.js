export default async function handler(req, res) {
  const pages = [];
  let url = 'https://goadmin.ifrc.org/api/v2/deployed_eru_by_event/?limit=100';
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Token ${process.env.IFRC_TOKEN}` } });
    const data = await r.json();
    pages.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  res.json(pages);
}
