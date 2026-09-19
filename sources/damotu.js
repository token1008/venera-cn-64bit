class DaMoTuManHua extends ComicSource {
  name = "大魔兔"

  key = "damotu"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/damotu.js"

  static baseUrl = "http://www.damotu.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  static pageSize = 20

  get headers() {
    return {
      "User-Agent": DaMoTuManHua.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": DaMoTuManHua.baseUrl + "/",
    }
  }

  // {page} 会被替换成页码；list-1 新番连载 / list-2 经典完结 / list-3 单行本 / list-4 站长推荐
  static categories = [
    ["新番连载", "list-1-{page}.htm"],
    ["经典完结", "list-2-{page}.htm"],
    ["站长推荐", "list-4-{page}.htm"],
    ["单行本", "list-3-{page}.htm"],
    ["热血", "list-1-{page}-t13.htm"],
    ["神鬼", "list-1-{page}-t2.htm"],
    ["恐怖", "list-1-{page}-t8.htm"],
    ["悬疑", "list-1-{page}-t10.htm"],
    ["奇幻", "list-1-{page}-t30.htm"],
    ["魔法", "list-1-{page}-t21.htm"],
    ["魔幻", "list-1-{page}-t35.htm"],
    ["科幻", "list-1-{page}-t32.htm"],
    ["机战", "list-1-{page}-t29.htm"],
    ["格斗", "list-1-{page}-t31.htm"],
    ["竞技", "list-1-{page}-t37.htm"],
    ["武侠", "list-1-{page}-t36.htm"],
    ["冒险", "list-1-{page}-t24.htm"],
    ["历史", "list-1-{page}-t23.htm"],
    ["战争", "list-1-{page}-t28.htm"],
    ["校园", "list-1-{page}-t12.htm"],
    ["爱情", "list-1-{page}-t34.htm"],
    ["后宫", "list-1-{page}-t6.htm"],
    ["百合", "list-1-{page}-t15.htm"],
    ["耽美", "list-1-{page}-t16.htm"],
    ["伪娘", "list-1-{page}-t4.htm"],
    ["性转换", "list-1-{page}-t7.htm"],
    ["治愈", "list-1-{page}-t11.htm"],
    ["亲情", "list-1-{page}-t14.htm"],
    ["萌系", "list-1-{page}-t18.htm"],
    ["搞笑", "list-1-{page}-t19.htm"],
    ["侦探", "list-1-{page}-t5.htm"],
    ["职场", "list-1-{page}-t17.htm"],
    ["腐女", "list-1-{page}-t20.htm"],
    ["励志", "list-1-{page}-t27.htm"],
    ["美食", "list-1-{page}-t38.htm"],
    ["音乐", "list-1-{page}-t39.htm"],
  ]

  // /manhua/667.htm -> /manhua/667.htm（详情页 id）
  static normalizeId(id) {
    let s = String(id || "")
    let m = s.match(/\/manhua\/(\d+)\.htm/)
    if (m) return `/manhua/${m[1]}.htm`
    let m2 = s.match(/\/manhua\/(\d+)\//)
    if (m2) return `/manhua/${m2[1]}.htm`
    if (/^\d+$/.test(s)) return `/manhua/${s}.htm`
    return s
  }

  static comicIdOf(id) {
    let s = String(id || "")
    let m = s.match(/(\d+)/)
    return m ? m[1] : s
  }

  // 封面目录按 1000 本一档：ceil(id / 1000)
  static coverUrl(id) {
    let n = parseInt(DaMoTuManHua.comicIdOf(id), 10)
    if (!n) return null
    let dir = Math.floor((n + 999) / 1000)
    return `${DaMoTuManHua.baseUrl}/cover/book/${dir}/${n}.jpg`
  }

  static cleanTitle(name, chapterTitle) {
    if (name) return name.trim()
    if (!chapterTitle) return ""
    return chapterTitle.replace(/\s*(第?\s*[\d.]+\s*话|第?\s*[\d.]+\s*回|特别篇)\s*$/, "").trim()
  }

  // 列表页（每页 20 本，li 内 a.list-book-col-*-icon 指向 /manhua/<id>.htm）
  _parseList(html) {
    let doc = new HtmlDocument(html)
    let comics = []
    let seen = {}
    for (let li of doc.querySelectorAll("li")) {
      let comicHref = null
      let titleAttr = null
      let cover = null
      let chapterTitle = null
      for (let a of li.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        let cls = (a.classNames || []).join(" ")
        if (/^\/manhua\/\d+\.htm$/.test(href) && !comicHref) {
          comicHref = href
          titleAttr = a.attributes["title"] || null
          let style = a.attributes["style"] || ""
          let m = style.match(/url\('?"?([^')"]+)'?"?\)/)
          if (m) cover = m[1]
        } else if (cls.indexOf("-name") >= 0) {
          chapterTitle = a.attributes["title"] || a.text.trim()
        }
      }
      if (!comicHref || seen[comicHref]) continue
      let title = DaMoTuManHua.cleanTitle(titleAttr, chapterTitle)
      if (!title) continue
      seen[comicHref] = 1
      comics.push(
        new Comic({
          id: comicHref,
          title: title,
          cover: cover || DaMoTuManHua.coverUrl(comicHref),
          subtitle: chapterTitle && chapterTitle !== title ? chapterTitle : null,
          tags: [],
        })
      )
    }
    return comics
  }

  _maxPage(html, page) {
    let m = String(html).match(/class="cd20"[^>]*>\s*(\d{1,5})\s*</g)
    let max = 0
    if (m) {
      for (let s of m) {
        let n = s.match(/(\d{1,5})\s*</)
        if (n) {
          let v = parseInt(n[1], 10)
          if (v > max) max = v
        }
      }
    }
    return max > 0 ? max : page
  }

  explore = DaMoTuManHua.categories.map(([title, tpl]) => ({
    title: title,
    type: "multiPageComicList",
    load: async (page) => {
      let path = tpl.replace("{page}", String(page))
      let res = await Network.get(`${DaMoTuManHua.baseUrl}/${path}`, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = this._parseList(res.body)
      return { comics: comics, maxPage: this._maxPage(res.body, page) }
    },
  }))

  // 站点自带的 -k 搜索入口已失效（返回空响应），改用站点的书籍索引 /js/book.htm 本地检索
  static bookIndexPromise = null

  static loadBookIndex() {
    if (DaMoTuManHua.bookIndexPromise) return DaMoTuManHua.bookIndexPromise
    DaMoTuManHua.bookIndexPromise = (async () => {
      let res = await Network.get(`${DaMoTuManHua.baseUrl}/js/book.htm`, {
        "User-Agent": DaMoTuManHua.ua,
        "Accept": "*/*",
        "Referer": DaMoTuManHua.baseUrl + "/",
      })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let body = String(res.body)
      let start = body.indexOf("[")
      let end = body.lastIndexOf("]")
      if (start < 0 || end <= start) throw "搜索索引解析失败"
      let list = JSON.parse(body.slice(start, end + 1))
      let out = []
      for (let it of list) {
        if (!it || !it.id || !it.name) continue
        out.push({ id: it.id, name: it.name })
      }
      if (!out.length) throw "搜索索引为空"
      return out
    })()
    DaMoTuManHua.bookIndexPromise.then(
      () => {},
      () => {
        DaMoTuManHua.bookIndexPromise = null
      }
    )
    return DaMoTuManHua.bookIndexPromise
  }

  search = {
    load: async (keyword, options, page) => {
      let kw = String(keyword || "").trim()
      if (!kw) return { comics: [], maxPage: 1 }
      let index = await DaMoTuManHua.loadBookIndex()
      let lower = kw.toLowerCase()
      let hits = []
      for (let it of index) {
        let name = it.name
        let idx = name.toLowerCase().indexOf(lower)
        if (idx < 0) continue
        let score = idx === 0 ? (name.length === kw.length ? 0 : 1) : 2
        hits.push({ id: it.id, name: name, score: score })
      }
      hits.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score
        if (a.name.length !== b.name.length) return a.name.length - b.name.length
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
      let size = DaMoTuManHua.pageSize
      let startIdx = (page - 1) * size
      let slice = hits.slice(startIdx, startIdx + size)
      let comics = slice.map(
        (h) =>
          new Comic({
            id: `/manhua/${h.id}.htm`,
            title: h.name,
            cover: DaMoTuManHua.coverUrl(h.id),
            tags: [],
          })
      )
      let maxPage = Math.max(1, Math.ceil(hits.length / size))
      return { comics: comics, maxPage: maxPage }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let path = DaMoTuManHua.normalizeId(id)
      let url = path.startsWith("http") ? path : `${DaMoTuManHua.baseUrl}${path}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".nav-box h1")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) {
        throw "Comic not found"
      }

      let author = null
      let updateTime = null
      let authorEl = doc.querySelector(".icon-right")
      if (authorEl) {
        let kids = authorEl.children || []
        if (kids.length > 0) author = kids[0].text.trim()
        if (kids.length > 1) updateTime = kids[1].text.trim()
      }

      let descEl = doc.querySelector(".book-detail-content")
      let coverEl = doc.querySelector(".icon-left img")

      // 章节列表：站点为倒序，整理成第 1 话在前（只取本书章节，过滤“猜你喜欢”）
      let cid = DaMoTuManHua.comicIdOf(path)
      let items = []
      let seen = {}
      for (let a of doc.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        if (!/^\/manhua\/\d+\/\d+\.htm$/.test(href)) continue
        if (href.indexOf(`/manhua/${cid}/`) !== 0) continue
        if (seen[href]) continue
        let name = (a.attributes["title"] || a.text).replace(/\s+/g, " ").trim()
        if (!name) continue
        seen[href] = 1
        items.push([href, name])
      }
      items.reverse()
      let numbered = []
      let others = []
      for (let it of items) {
        if (/\d/.test(it[1])) numbered.push(it)
        else others.push(it)
      }
      let chapters = new Map()
      for (let it of numbered.concat(others)) chapters.set(it[0], it[1])

      let cover = coverEl ? coverEl.attributes["src"] : null
      if (!cover) cover = DaMoTuManHua.coverUrl(path)

      return new ComicDetails({
        title: title,
        subtitle: updateTime ? `更新：${updateTime}` : null,
        cover: cover,
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": author ? [author] : [] },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let path = String(epId)
      let url = path.startsWith("http") ? path : `${DaMoTuManHua.baseUrl}${path}`
      let res = await Network.get(url, {
        ...this.headers,
        "Referer": `${DaMoTuManHua.baseUrl}${DaMoTuManHua.normalizeId(comicId)}`,
      })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      // 图片由 /js/fview.htm 拼接：/image/<序号>-<did>-<node>.htm
      let doc = new HtmlDocument(res.body)
      let box = doc.getElementById("preview-box-0")
      if (!box) {
        throw "章节页面结构异常"
      }
      let attrs = box.attributes || {}
      let count = parseInt(attrs["count"] || "0", 10)
      let node = attrs["node"]
      let did = attrs["did"]
      if (!count || !node || !did) throw "无法解析章节图片列表"

      let images = []
      for (let i = 1; i <= count; i++) {
        images.push(`${DaMoTuManHua.baseUrl}/image/${i}-${did}-${node}.htm`)
      }
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // /image/ 接口本身不校验 Referer，但老站点偶尔抽风，统一带上更稳
      return {
        headers: {
          "User-Agent": DaMoTuManHua.ua,
          "Referer": `${DaMoTuManHua.baseUrl}${DaMoTuManHua.normalizeId(comicId)}`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => ({
          headers: {
            "User-Agent": DaMoTuManHua.ua,
            "Referer": `${DaMoTuManHua.baseUrl}/`,
          },
        }),
      }
    },
  }
}
