self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^\\/re-wear(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!api|_next\\/static|_next\\/image|icons|sw.js|manifest.webmanifest|icon.png).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!api|_next/static|_next/image|icons|sw.js|manifest.webmanifest|icon.png).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()