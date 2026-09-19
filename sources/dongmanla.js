class DongManLa extends ComicSource {
  name = "动漫啦"

  key = "dongmanla"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/dongmanla.js"

  // 站点对移动 UA 会 302 到 m 站，直接用手机版：列表/详情/章节结构一致
  static baseUrl = "https://m.dongman.la"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": DongManLa.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  // 分类页：/manhua/class/<id>/ 与地区/状态页都实测可用；站点没有年份筛选（页面无年份参数）
  static categories = [
    ["日本漫画", "manhua/japan/"],
    ["港台漫画", "manhua/hongkongtaiwan/"],
    ["欧美漫画", "manhua/oumei/"],
    ["国产漫画", "manhua/guochan/"],
    ["连载中", "manhua/serial/"],
    ["已完结", "manhua/finish/"],
    ["热血", "manhua/class/32/"],
    ["爱情", "manhua/class/24/"],
    ["校园", "manhua/class/18/"],
    ["格斗", "manhua/class/16/"],
    ["竞技", "manhua/class/17/"],
    ["恐怖", "manhua/class/19/"],
    ["悬疑", "manhua/class/20/"],
    ["奇幻", "manhua/class/21/"],
    ["魔法", "manhua/class/22/"],
    ["神鬼", "manhua/class/23/"],
    ["搞笑", "manhua/class/25/"],
    ["耽美", "manhua/class/27/"],
    ["历史", "manhua/class/29/"],
    ["战争", "manhua/class/30/"],
    ["后宫", "manhua/class/33/"],
    ["魔幻", "manhua/class/34/"],
    ["美食", "manhua/class/35/"],
    ["萌系", "manhua/class/37/"],
    ["百合", "manhua/class/38/"],
    ["治愈", "manhua/class/42/"],
    ["少女", "manhua/class/43/"],
    ["职场", "manhua/class/45/"],
    ["侦探", "manhua/class/46/"],
    ["机战", "manhua/class/47/"],
    ["青年", "manhua/class/48/"],
    ["少年", "manhua/class/49/"],
    ["生活", "manhua/class/82/"],
    ["腐漫", "manhua/class/83/"],
  ]

  _abs(path) {
    if (!path) return null
    if (path.indexOf("http") === 0) return path
    return DongManLa.baseUrl + path
  }

  // 站点偶发 403/5xx（CDN 抖动），重试后一般能拿到 200
  async _get(url, headers) {
    let last = 0
    for (let i = 0; i < 3; i++) {
      let res = await Network.get(url, headers || this.headers)
      if (res.status === 200) return res
      last = res.status
      if (res.status !== 403 && res.status !== 429 && res.status < 500) break
    }
    throw `Invalid status code: ${last}`
  }

  // 列表页：搜索/分类页用 article.comic-item，首页用 article.mdui-card-media，
  // 共同点是每张卡片里都有一个 .dml-list-title > a
  _parseList(doc) {
    let comics = []
    for (let card of doc.querySelectorAll(".dml-list-title")) {
      let a = card.querySelector("a")
      if (!a) continue
      let href = a.attributes["href"]
      let title = a.text.trim()
      if (!href || !title) continue
      let parent = card.parent
      let img = parent ? parent.querySelector("img") : null
      let cover = img ? (img.attributes["src"] || img.attributes["data-src"]) : null
      comics.push(new Comic({
        id: href.replace(/^https?:\/\/[^/]+/, ""),
        title: title,
        cover: cover,
        tags: [],
      }))
    }
    return comics
  }

  // 手机版分页条：<nav class="pages">，有“下一页”链接说明还有更多页
  _maxPage(doc, page) {
    for (let a of doc.querySelectorAll("nav.pages a")) {
      if (a.text.trim() === "下一页") return page + 1
    }
    return page
  }

  // 章节页图片：all.html 里是 <img data-src="https://img.dongman.la/...">，
  // 单页模式是 <img src="...">
  static parseImages(body) {
    let images = []
    for (let m of body.match(/<img[^>]+>/g) || []) {
      let mm = m.match(/(?:data-src|src)="(https?:\/\/img\.dongman\.la\/[^"]+)"/)
      if (!mm) continue
      if (images.indexOf(mm[1]) < 0) images.push(mm[1])
    }
    return images
  }

  explore = DongManLa.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = page === 1
        ? `${DongManLa.baseUrl}/${path}`
        : `${DongManLa.baseUrl}/${path}${page}.html`
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      doc.dispose()
      return { comics: comics, maxPage: maxPage }
    },
  })).concat([{
    // 首页“最近更新”没有独立 URL，用首页当作一个探索页
    title: "最近更新",
    type: "multiPageComicList",
    load: async (page) => {
      let res = await this._get(`${DongManLa.baseUrl}/`)
      let doc = new HtmlDocument(res.body)
      let comics = page === 1 ? this._parseList(doc) : []
      doc.dispose()
      return { comics: comics, maxPage: page }
    },
  }])

  search = {
    load: async (keyword, options, page) => {
      let base = `${DongManLa.baseUrl}/manhua/so/${encodeURIComponent(keyword)}/`
      let url = page === 1 ? base : `${base}${page}.html`
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      doc.dispose()
      return { comics: comics, maxPage: maxPage }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = this._abs(id)
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector("h1")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      // 封面图 alt 形如 “斗破苍穹漫画封面”
      let cover = null
      for (let img of doc.querySelectorAll("img")) {
        let alt = img.attributes["alt"] || ""
        if (alt.indexOf("封面") >= 0) {
          cover = img.attributes["src"] || img.attributes["data-src"]
          break
        }
      }

      // 作者：<a href="#"><span itemprop="name">作者名</span></a>
      // （面包屑里的 span[itemprop=name] 不能要，其父链接 href 不是 "#"）
      let author = null
      for (let a of doc.querySelectorAll("a")) {
        if (a.attributes["href"] !== "#") continue
        let sp = a.querySelector("span[itemprop=name]")
        if (sp) { author = sp.text.trim(); break }
      }
      let genreEl = doc.querySelector("a[itemprop=genre]")
      let genreText = genreEl ? genreEl.text.trim() : ""
      let tags = {}
      if (author) tags["作者"] = [author]
      if (genreText) tags["题材"] = genreText.split(",").filter((t) => t)

      let descEl = doc.querySelector("[itemprop=description]")
      let desc = descEl ? descEl.text.trim() : null

      // 章节列表默认按话号倒序，倒过来即阅读顺序（第 1 话在前）
      let chapters = new Map()
      let items = []
      let listEl = doc.querySelector("#chapterList")
      if (listEl) {
        for (let a of listEl.querySelectorAll("a")) {
          let href = a.attributes["href"]
          let name = a.text.trim()
          if (href && name) items.push([href, name])
        }
      }
      items.reverse()
      for (let [href, name] of items) chapters.set(href, name)

      doc.dispose()
      return new ComicDetails({
        title: title,
        cover: cover,
        description: desc,
        tags: tags,
        chapters: chapters,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let base = this._abs(epId)
      let hdrs = { ...this.headers, "Referer": this._abs(comicId) }
      // 章节页有“单页滚动”模式 all.html，一次能拿到整话图片
      let images = []
      try {
        let res = await this._get(`${base}all.html`, hdrs)
        images = DongManLa.parseImages(res.body)
      } catch (e) {
        images = []
      }
      if (!images.length) {
        // 没有 all.html（或解析不到）时退回单页模式
        let res = await this._get(base, hdrs)
        images = DongManLa.parseImages(res.body)
      }
      if (!images.length) throw "获取图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 实测 img.dongman.la 不带 Referer 也能取到图，仍显式带上 Referer 更稳
      return {
        headers: {
          "User-Agent": DongManLa.ua,
          "Referer": `${DongManLa.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => ({
          headers: {
            "User-Agent": DongManLa.ua,
            "Referer": `${DongManLa.baseUrl}/`,
          },
        }),
      }
    },
  }
}
