export default async function handler(req, res) {
  const pages = [];
  let url = 'https://goadmin.ifrc.org/api/v2/appeal/?limit=500&atype=0&start_date__gte=2016-01-01&ordering=start_date';
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Token ${process.env.IFRC_TOKEN}` } });
    const data = await r.json();
    pages.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  res.json(pages);
}
