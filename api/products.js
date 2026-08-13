'use strict';

const { getCatalog } = require('../lib/printful');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const catalog = await getCatalog();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ products: catalog });
  } catch (err) {
    console.error('GET /api/products failed:', err);
    return res.status(502).json({ error: 'Could not load products' });
  }
};
