class QiManWu extends ComicSource {
  // 2026-09-19 实测：www.mihaimoga.com 已不再提供漫画内容。
  // 站内没有搜索框（首页无任何 form / search 链接），任意路径（/ajaxf/、/spotlight、/api/、
  // ?s=... ）都返回**内容随机的无关 SEO 文章页**（无章节、无 <img>），甚至 /main.css 也返回文章页。
  // 上一代规则使用的接口在本文件里仍然保留（搜索结果 JSON 或 .comic-list-item HTML 双结构解析），
  // 一旦站点恢复漫画数据即可直接工作；当前请求会明确抛错提示站点已失效，而不是给出无法解释的空列表。
  name = "奇漫屋"

  key = "qimanwu"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/qimanwu.js"

  static baseUrl = "http://www.mihaimoga.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  static deadMsg = "奇漫屋(mihaimoga.com)已不再提供漫画：站点现在对任意路径返回无关的 SEO 文章页，没有搜索/章节/图片"

  get headers() {
    return {
      "User-Agent": QiManWu.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": `${QiManWu.baseUrl}/`,
    }
  }

  // 榜单 / 分类（沿用上一代规则的 ajaxf 接口参数）
  static ranks = [
    ["日读榜", "1"],
    ["周读榜", "2"],
    ["月读榜", "3"],
    ["人气榜", "4"],
    ["最新榜", "5"],
    ["新作榜", "6"],
  ]

  static sorts = [
    ["冒险热血", "1"],
    ["武侠格斗", "2"],
    ["科幻魔幻", "3"],
    ["侦探推理", "4"],
    ["耽美爱情", "5"],
    ["生活漫画", "6"],
    ["推荐漫画", "11"],
    ["完结漫画", "12"],
    ["连载漫画", "13"],
  ]

  static absUrl(u) {
    if (!u) return null
    if (u.indexOf("//") === 0) return "http:" + u
    if (u.indexOf("http") === 0) return u
    return QiManWu.baseUrl + (u.charAt(0) === "/" ? u : "/" + u)
  }

  // 接口返回 JSON 数组（老接口）时的解析
  static parseJsonList(text) {
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      return null
    }
    if (!Array.isArray(data)) return null
    let comics = []
    for (let it of data) {
      if (!it || !it.id || !it.name) continue
      let tags = []
      if (it.biaoqian) {
        for (let t of String(it.biaoqian).split(/[|,，]/)) {
          let s = t.trim()
          if (s) tags.push(s)
        }
      }
      comics.push(new Comic({
        id: String(it.id),
        title: String(it.name),
        cover: QiManWu.absUrl(it.imgurl),
        subtitle: it.lastvolume ? String(it.lastvolume) : null,
        tags: tags,
      }))
    }
    return comics
  }

  // 解析搜索结果页（class.comic-list-item）
  _parseSearchHtml(doc) {
    let comics = []
    for (let div of doc.querySelectorAll(".comic-list-item")) {
      let nameEl = div.querySelector(".comic-name")
      let a = nameEl ? nameEl.querySelector("a") : div.querySelector("a")
      if (!a) continue
      let href = a.attributes["href"] || ""
      let id = href.replace(/\//g, "")
      let title = a.text.trim()
      if (!id || !title) continue
      let coverEl = div.querySelector(".cover")
      let imgEl = coverEl ? coverEl.querySelector("img") : div.querySelector("img")
      let tags = []
      let tagEl = div.querySelector(".comic-tags")
      if (tagEl) {
        for (let span of tagEl.querySelectorAll("span")) {
          let t = span.text.trim()
          if (t) tags.push(t)
        }
      }
      let authorEl = div.querySelector(".comic-author")
      let updateEl = div.querySelector(".comic-update-at")
      comics.push(new Comic({
        id: id,
        title: title,
        cover: QiManWu.absUrl(imgEl ? (imgEl.attributes["data-original"] || imgEl.attributes["src"]) : null),
        subtitle: updateEl ? updateEl.text.trim() : (authorEl ? authorEl.text.trim() : null),
        tags: tags,
      }))
    }
    return comics
  }

  explore = [
    ...QiManWu.ranks.map(([label, type]) => ({
      title: label,
      type: "multiPageComicList",
      load: async (page) => this._loadApi(`/ajaxf/?page_num=${page - 1}&type=${type}`, page),
    })),
    ...QiManWu.sorts.map(([label, type]) => ({
      title: label,
      type: "multiPageComicList",
      load: async (page) => this._loadApi(`/ajaxf/sort/?page_num=${page - 1}&type=${type}`, page),
    })),
  ]

  async _loadApi(path, page) {
    let res = await Network.get(`${QiManWu.baseUrl}${path}`, this.headers)
    if (res.status !== 200) throw `Invalid status code: ${res.status}`
    let comics = QiManWu.parseJsonList(res.body)
    if (comics === null) {
      // 站点异常时返回的不是 JSON —— 明确报错而不是静默空列表
      let doc = new HtmlDocument(res.body)
      comics = this._parseSearchHtml(doc)
      let isComic = comics.length > 0
      if (!isComic) throw QiManWu.deadMsg
    }
    return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
  }

  search = {
    load: async (keyword, options, page) => {
      let url = `${QiManWu.baseUrl}/spotlight?keyword=${encodeURIComponent(keyword)}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = QiManWu.parseJsonList(res.body)
      if (comics === null) {
        let doc = new HtmlDocument(res.body)
        comics = this._parseSearchHtml(doc)
        let hasList = doc.querySelector(".comic-list-item") ? true : false
        if (!comics.length && !hasList) throw QiManWu.deadMsg
      }
      return { comics: comics, maxPage: page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${QiManWu.baseUrl}/${id}/`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".box-back2")
      let h1 = titleEl ? titleEl.querySelector("h1") : null
      let title = h1 ? h1.text.trim() : null
      if (!title) {
        throw QiManWu.deadMsg
      }

      let coverBox = doc.querySelector(".box-back1")
      let coverEl = coverBox ? coverBox.querySelector("img") : null
      let descEl = doc.querySelector(".comic-intro")

      let author = null, kind = null
      let infos = []
      if (titleEl) {
        for (let el of titleEl.querySelectorAll(".txtItme")) {
          let t = el.text.replace(/^[^：:]*[：:]\s*/, "").trim()
          if (t) infos.push(t)
        }
      }
      if (infos.length >= 4) {
        author = infos[infos.length - 4]
        kind = infos[infos.length - 3]
      }

      let tags = []
      if (kind) for (let t of kind.split(/[\s,，|/]+/)) {
        let s = t.trim()
        if (s) tags.push(s)
      }

      // 章节链接形如 /<comicId>/<chapterId>.html（上一代规则的 chapter.id + '.html'）
      let chapters = new Map()
      let items = []
      for (let a of doc.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        if (href.indexOf(`/${id}/`) !== 0 || href.indexOf(".html") < 0) continue
        let name = a.text.trim()
        if (name) items.push([href, name])
      }
      items.reverse()
      for (let [href, name] of items) chapters.set(href, name)

      return new ComicDetails({
        title: title,
        cover: QiManWu.absUrl(coverEl ? (coverEl.attributes["data-original"] || coverEl.attributes["src"]) : null),
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId.startsWith("http") ? epId : `${QiManWu.baseUrl}${epId}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let images = []
      for (let img of doc.querySelectorAll("img")) {
        let u = img.attributes["data-original"] || img.attributes["data-src"] || img.attributes["src"]
        if (!u || u.indexOf("http") !== 0) continue
        if (u.indexOf("/images/") >= 0) continue
        images.push(u)
      }
      if (!images.length) throw QiManWu.deadMsg
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片可能挂在独立 CDN 上，统一带上站点 Referer；失败时同头重试一次
      return {
        headers: {
          "User-Agent": QiManWu.ua,
          "Referer": `${QiManWu.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => ({
          headers: {
            "User-Agent": QiManWu.ua,
            "Referer": `${QiManWu.baseUrl}/`,
          },
        }),
      }
    },
  }
}
