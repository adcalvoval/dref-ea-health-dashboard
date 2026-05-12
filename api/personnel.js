export default async function handler(req, res) {
  const response = await fetch(
    'https://goadmin.ifrc.org/api/v2/personnel/?limit=500&ordering=-start_date',
    { headers: { Authorization: `Token ${process.env.IFRC_TOKEN}` } }
  );
  const data = await response.json();
  res.json(data);
}
