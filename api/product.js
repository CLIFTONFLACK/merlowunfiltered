'use strict';

const { getProductDetail } = require('../lib/printful');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = new URL(req.url, `http://${req.headers.host}`).searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'A numeric product id is required' });
  }

  try {
    const product = await getProductDetail(id);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ product });
  } catch (err) {
    console.error(`GET /api/product?id=${id} failed:`, err);
    // Printful answers a missing store product with a 404 in the message.
    const missing = /\(404\)/.test(String(err.message));
    return res.status(missing ? 404 : 502).json({
      error: missing ? 'No such product' : 'Could not load the product',
    });
  }
};
