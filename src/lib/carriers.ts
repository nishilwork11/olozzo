// European parcel carriers and their public tracking pages.
export const CARRIER_URLS: Record<string, (tracking: string) => string> = {
  DHL: (t) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${t}`,
  DPD: (t) => `https://tracking.dpd.de/status/en_US/parcel/${t}`,
  GLS: (t) => `https://gls-group.com/track/${t}`,
  UPS: (t) => `https://www.ups.com/track?tracknum=${t}`,
  PostNL: (t) => `https://jouw.postnl.nl/track-and-trace/${t}`,
  "La Poste / Colissimo": (t) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${t}`,
  InPost: (t) => `https://inpost.pl/sledzenie-przesylek?number=${t}`,
  CTT: (t) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${t}`,
};

export const CARRIERS = Object.keys(CARRIER_URLS);

export function trackingUrlFor(carrier: string, trackingNumber: string): string | null {
  return CARRIER_URLS[carrier]?.(encodeURIComponent(trackingNumber)) ?? null;
}
