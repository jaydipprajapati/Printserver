const storage = require('../storage');

class PricingService {
  calculateCost({ pagesCount, copies = 1, colorMode = 'bw', paperSize = 'A4', duplex = 'simplex' }) {
    const settings = storage.getSettings();
    const pricing = settings.pricing;

    const baseRate = colorMode === 'color' ? pricing.colorPerPage : pricing.bwPerPage;
    const multiplier = pricing.paperMultipliers[paperSize] || 1.0;
    const ratePerPage = +(baseRate * multiplier).toFixed(2);

    let singleSetCost = ratePerPage * pagesCount;

    // Apply duplex discount if double-sided and more than 1 page
    let discount = 0;
    if (duplex !== 'simplex' && pagesCount > 1 && pricing.duplexDiscountPercent > 0) {
      discount = +(singleSetCost * (pricing.duplexDiscountPercent / 100)).toFixed(2);
      singleSetCost -= discount;
    }

    const totalCost = +(singleSetCost * copies).toFixed(2);

    return {
      currency: settings.currency || '₹',
      baseRate,
      multiplier,
      ratePerPage,
      pagesCount,
      copies,
      duplexDiscount: discount * copies,
      totalCost,
      breakdown: `${copies} copy(ies) × ${pagesCount} page(s) @ ${settings.currency}${ratePerPage}/page${discount > 0 ? ` (incl. ${pricing.duplexDiscountPercent}% duplex discount)` : ''}`
    };
  }
}

module.exports = new PricingService();
