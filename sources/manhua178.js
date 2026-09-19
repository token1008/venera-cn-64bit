class Manhua178 extends ComicSource {
  // 站点是漫客栈(mkzhan)的镜像：2022 年抓取的旧书（如 /book/14/ 斗破苍穹）章节页里的
  // content.mkzcdn.com 图片 auth_key 已过期，CDN 固定 403（站点自身也打不开，非本源可控）；
  // 近期抓取的书（id 大致 4000 以上）图片正常，实测 200 webp。
  name = "178漫画网"

  key = "manhua178"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/manhua178.js"

  static baseUrl = "https://patternrecognition.cn"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": Manhua178.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  // 站点顶部分类条的真实分类（/category/<id>/，id 为站点自身的编号）
  static categories = [
    ["全部", ""],
    ["霸总", "1"],
    ["恋爱", "2"],
    ["生活", "3"],
    ["热血", "4"],
    ["后宫", "5"],
    ["玄幻", "6"],
    ["修真", "7"],
    ["古风", "8"],
    ["校园", "9"],
    ["动作", "10"],
    ["竞技", "11"],
    ["搞笑", "12"],
    ["战争", "13"],
    ["穿越", "14"],
    ["冒险", "15"],
    ["灵异", "16"],
    ["架空", "17"],
    ["悬疑", "18"],
    ["恐怖", "19"],
    ["励志", "20"],
    ["科幻", "21"],
    ["同人", "22"],
    ["其他", "23"],
    ["真人", "24"],
  ]

  static absUrl(u) {
    if (!u) return null
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.indexOf("http") === 0) return u
    return Manhua178.baseUrl + u
  }

  // 列表页有两种结构：分类页用 li > .manga-list-2-title，搜索页用 li > .book-list-info-title
  _parseList(doc) {
    let comics = []
    for (let li of doc.querySelectorAll("li")) {
      let titleEl = li.querySelector(".manga-list-2-title") || li.querySelector(".book-list-info-title")
      let coverEl = li.querySelector(".manga-list-2-cover-img") || li.querySelector(".book-list-cover-img")
      let linkEl = titleEl ? titleEl.querySelector("a") : null
      if (!linkEl) linkEl = li.querySelector(".book-list-cover a")
      if (!linkEl) linkEl = li.querySelector("a")
      if (!titleEl || !linkEl) continue
      let href = linkEl.attributes["href"]
      if (!href || href.indexOf("/book/") !== 0) continue
      let title = titleEl.text.trim()
      if (!title) continue
      let descEl = li.querySelector(".manga-list-2-tip") || li.querySelector(".book-list-info-desc")
      comics.push(new Comic({
        id: href,
        title: title,
        cover: Manhua178.absUrl(coverEl ? (coverEl.attributes["data-original"] || coverEl.attributes["src"]) : null),
        subtitle: descEl ? descEl.text.trim() : null,
        tags: [],
      }))
    }
    return comics
  }

  explore = Manhua178.categories.map(([label, id]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let path = id ? `/category/${id}/` : "/category/"
      let url = page === 1
        ? `${Manhua178.baseUrl}${path}`
        : `${Manhua178.baseUrl}${path}?page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      doc.dispose()
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      // 站内搜索为服务端渲染：/search/<关键词>/?page=N
      let url = `${Manhua178.baseUrl}/search/${encodeURIComponent(keyword)}/?page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      doc.dispose()
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${Manhua178.baseUrl}${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".detail-main-info-title")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let coverBox = doc.querySelector(".detail-main-cover")
      let coverEl = coverBox ? coverBox.querySelector("img") : null
      let descEl = doc.querySelector(".detail-main-info-description")

      let authorEl = doc.querySelector(".detail-main-info-author")
      let author = authorEl ? authorEl.text.replace(/^作者[：:]\s*/, "").trim() : null

      let tags = []
      let classEl = doc.querySelector(".detail-main-info-class")
      if (classEl) {
        for (let a of classEl.querySelectorAll("a")) {
          let t = a.text.trim()
          if (t) tags.push(t)
        }
      }

      // 站点章节为“新话在前”，反转成阅读顺序（第 1 话在前）
      let chapters = new Map()
      let items = []
      for (let li of doc.querySelectorAll("#detail-list-select li")) {
        let a = li.querySelector("a")
        if (!a) continue
        let href = a.attributes["href"]
        let name = a.text.trim()
        if (href && href.indexOf("/chapter/") === 0 && name) items.push([href, name])
      }
      items.reverse()
      for (let [href, name] of items) chapters.set(href, name)

      let subtitle = null
      let statusEl = doc.querySelector(".detail-list-title-1")
      if (statusEl) subtitle = statusEl.text.trim()

      let updateTime = null
      let timeEl = doc.querySelector(".detail-list-title-3")
      if (timeEl) updateTime = timeEl.text.replace(/更新$/, "").trim()

      doc.dispose()
      return new ComicDetails({
        title: title,
        subtitle: subtitle,
        cover: Manhua178.absUrl(coverEl ? (coverEl.attributes["data-original"] || coverEl.attributes["src"]) : null),
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId.startsWith("http") ? epId : `${Manhua178.baseUrl}${epId}`
      let comicUrl = comicId.startsWith("http") ? comicId : `${Manhua178.baseUrl}${comicId}`
      let res = await Network.get(url, { ...this.headers, "Referer": comicUrl })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      // 图片以懒加载属性存放：<img class="lazy" data-original="http://content.mkzcdn.com/...">
      let images = []
      for (let img of doc.querySelectorAll("img")) {
        let cls = img.classNames || []
        if (cls.indexOf("lazy") < 0) continue
        let u = img.attributes["data-original"] || img.attributes["data-src"] || img.attributes["src"]
        if (u && u.indexOf("http") === 0) images.push(u)
      }
      doc.dispose()
      if (!images.length) throw "获取图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片落在 content.mkzcdn.com；带站点 Referer + 移动 UA，避免 CDN 防盗链导致黑屏
      return {
        headers: {
          "User-Agent": Manhua178.ua,
          "Referer": `${Manhua178.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // CDN 偶发重置连接：失败时按同样请求头重试一次
        onLoadFailed: () => ({
          headers: {
            "User-Agent": Manhua178.ua,
            "Referer": `${Manhua178.baseUrl}/`,
          },
        }),
      }
    },
  }
}
