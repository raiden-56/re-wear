/**
 * Editorial photography (Unsplash licence, hot-linked from images.unsplash.com).
 * Every image was chosen to show real garments, sorting or textile material.
 */
const u = (id: string, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

export const images = {
  heroRack: u("photo-1540221652346-e5dd6b50f3e7"),
  rackNeutral: u("photo-1786118791511-0252f7c4f156"),
  sweatersRack: u("photo-1582719188393-bb71ca45dbb9"),
  pileDenimShirts: u("photo-1604072374690-0e7d7bddd54e"),
  foldedShirts: u("photo-1562157873-818bc0726f68"),
  foldedSweaters: u("photo-1760013531865-89ff324f83a6"),
  foldedJeansHands: u("photo-1604176354204-9268737828e4"),
  sortingWarehouse: u("photo-1606053929013-311c13f97b5f"),
  threadSpools: u("photo-1783309529812-89858c809862"),
  fabricScraps: u("photo-1781300007449-c1fb4c532bc4"),
  cottonBolls: u("photo-1770122985572-ca890ef5ecf3"),
  streetMarket: u("photo-1788095905385-f9361e8adc6d"),
  browsingRack: u("photo-1778512408867-f657b926cc4f"),
  embroideredFabric: u("photo-1787220272461-2c53528c9349"),
  jeansStack: u("photo-1565084888279-aca607ecce0c"),
  kidsRack: u("photo-1760287363879-6012adab292c"),
  donationCrate: u("photo-1744059510375-b42f562cda63"),
  hangingClothes: u("photo-1470309864661-68328b2cd0a5"),
  apparel: u("photo-1542060748-10c28b62716f"),
};

export const productPhotos = {
  leatherJacket: [u("photo-1727515546577-f7d82a47b51d", 1000), u("photo-1727516299214-c4d54704b045", 1000)],
  denim: [u("photo-1542272604-787c3835535d", 1000), u("photo-1713880453396-aa0493e308ec", 1000)],
  floralShirt: [u("photo-1622780432053-767528938f34", 1000)],
  laceDress: [u("photo-1591221662157-6f62de5508eb", 1000)],
  whiteShirt: [u("photo-1605450081927-6b40c11c661f", 1000)],
  greyShirt: [u("photo-1564584217132-2271feaeb3c5", 1000)],
  whiteTee: [u("photo-1622290291468-a28f7a7dc6a8", 1000)],
  sweaters: [u("photo-1760013529817-f50db943ffe2", 1000)],
  flannel: [u("photo-1782227293813-040b9f9ce99e", 1000)],
  embroidered: [u("photo-1787220272461-2c53528c9349", 1000)],
  kidsJackets: [u("photo-1768383235583-99e9d8c836b0", 1000)],
  dresses: [u("photo-1560506840-ec148e82a604", 1000)],
};

export const categoryImages: Record<string, string> = {
  "mens-wear": u("photo-1709916314093-5bbc88f6ee8c", 800),
  "womens-wear": u("photo-1560506840-ec148e82a604", 800),
  kidswear: u("photo-1760287363879-6012adab292c", 800),
  sarees: u("photo-1787220272461-2c53528c9349", 800),
  "ethnic-wear": u("photo-1617331721458-bd3bd3f9c7f8", 800),
  jeans: u("photo-1565084888279-aca607ecce0c", 800),
  trousers: u("photo-1542272604-787c3835535d", 800),
  shirts: u("photo-1562157873-818bc0726f68", 800),
  "t-shirts": u("photo-1622290291468-a28f7a7dc6a8", 800),
  dresses: u("photo-1591221662157-6f62de5508eb", 800),
  jackets: u("photo-1727515546577-f7d82a47b51d", 800),
  sweaters: u("photo-1760013531865-89ff324f83a6", 800),
  "other-textiles": u("photo-1534639077088-d702bcf685e7", 800),
};
