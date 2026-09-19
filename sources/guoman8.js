class GuoMan8 extends ComicSource {
  name = "国漫吧"

  key = "guoman8"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/guoman8.js"

  static baseUrl = "http://www.guoman8.cc"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  // 章节页里的图片有两种：
  //   1) 新图：fs 里是绝对地址（如 http://tukaobei.haotu90.top/...），可直接用
  //   2) 老图：fs 里是相对路径（/ManHuaKu/... 或 /manhuatuku/...），要拼图床
  // 站点 PC 版 configs.js 配的图床 images.720rs.com 已无 DNS 记录（实测 NXDOMAIN），
  // 手机版 m.guoman8.cc 配的是 imagesold.502215.com（主）/ images.tingliu.cc（备用），
  // 实测 /manhuatuku/ 老图在 images.tingliu.cc 上可用，故按路径选择默认图床。
  static imgHost = "https://imagesold.502215.com"

  static imgHostTingliu = "https://images.tingliu.cc"

  get headers() {
    return {
      "User-Agent": GuoMan8.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  // /list/<filters> 结构，页码：/list/xxx-p-2（"全部" 是 /list/p-2）
  // 地区值用站点自身的百分号编码，年份用 year-YYYY（站点有年份筛选参数）
  static categories = [
    ["全部", "list/"],
    ["最近更新", "list/order-addtime"],
    ["人气最旺", "list/order-hits"],
    ["评分最高", "list/order-gold"],
    ["连载", "list/lz-1"],
    ["完结", "list/lz-2"],
    ["日本", "list/area-%E6%97%A5%E6%9C%AC"],
    ["港台", "list/area-%E6%B8%AF%E5%8F%B0"],
    ["欧美", "list/area-%E6%AC%A7%E7%BE%8E"],
    ["韩国", "list/area-%E9%9F%A9%E5%9B%BD"],
    ["国产", "list/area-%E5%9B%BD%E4%BA%A7"],
    ["其它", "list/area-%E5%85%B6%E5%AE%83"],
    ["热血", "list/smid-1"],
    ["武侠", "list/smid-2"],
    ["搞笑", "list/smid-3"],
    ["耽美", "list/smid-4"],
    ["爱情", "list/smid-5"],
    ["科幻", "list/smid-6"],
    ["魔法", "list/smid-7"],
    ["神魔", "list/smid-8"],
    ["竞技", "list/smid-9"],
    ["格斗", "list/smid-10"],
    ["机战", "list/smid-11"],
    ["运动", "list/smid-13"],
    ["校园", "list/smid-14"],
    ["历史", "list/smid-16"],
    ["百合", "list/smid-18"],
    ["后宫", "list/smid-19"],
    ["治愈", "list/smid-20"],
    ["美食", "list/smid-21"],
    ["推理", "list/smid-22"],
    ["悬疑", "list/smid-23"],
    ["恐怖", "list/smid-24"],
    ["职场", "list/smid-25"],
    ["剧情", "list/smid-27"],
    ["生活", "list/smid-28"],
    ["幻想", "list/smid-29"],
    ["战争", "list/smid-30"],
    ["仙侠", "list/smid-33"],
    ["古风", "list/smid-36"],
    ["玄幻", "list/smid-37"],
    ["穿越", "list/smid-38"],
    ["冒险", "list/smid-41"],
    ["奇幻", "list/smid-42"],
    // 年份筛选（站点“按年份”选项里 2020 无数据，取有内容的近几年）
    ["按年份 2019", "list/year-2019"],
    ["按年份 2018", "list/year-2018"],
    ["按年份 2017", "list/year-2017"],
    ["按年份 2016", "list/year-2016"],
    ["按年份 2015", "list/year-2015"],
    ["按年份 2014", "list/year-2014"],
  ]

  _abs(path) {
    if (!path) return null
    if (path.indexOf("http") === 0) return path
    if (path.charAt(0) !== "/") path = "/" + path
    return GuoMan8.baseUrl + path
  }

  // 站点走 Cloudflare，偶发返回 403 的 JS 跳转页，重试一次多半就 200
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

  _listUrl(path, page) {
    if (page === 1) return `${GuoMan8.baseUrl}/${path}`
    if (path.charAt(path.length - 1) === "/") return `${GuoMan8.baseUrl}/${path}p-${page}`
    return `${GuoMan8.baseUrl}/${path}-p-${page}`
  }

  // 列表页（#contList）、搜索结果页（.book-result）都用这个
  _parseList(doc) {
    let comics = []
    for (let li of doc.querySelectorAll("li")) {
      let coverEl = li.querySelector(".bcover")
      let titleEl = li.querySelector(".book-detail dt a") || li.querySelector("p.ell a")
      if (!coverEl || !titleEl) continue
      let href = titleEl.attributes["href"] || coverEl.attributes["href"]
      let title = titleEl.text.trim()
      if (!href || !title) continue
      let img = coverEl.querySelector("img")
      let cover = img ? (img.attributes["src"] || img.attributes["data-src"]) : null
      let ttEl = li.querySelector(".tt")
      let subtitle = ttEl ? ttEl.text.trim() : null
      comics.push(new Comic({
        id: this._abs(href),
        title: title,
        cover: cover,
        subtitle: subtitle,
        tags: [],
      }))
    }
    return comics
  }

  _maxPage(doc, page) {
    let max = page
    let pager = doc.querySelector(".pager-cont")
    if (pager) {
      for (let a of pager.querySelectorAll("a")) {
        let t = a.text.trim()
        if (/^\d+$/.test(t)) {
          let n = parseInt(t, 10)
          if (n > max) max = n
        }
      }
    }
    return max
  }

  explore = GuoMan8.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let res = await this._get(this._listUrl(path, page))
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      return { comics: comics, maxPage: maxPage }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      let k = encodeURIComponent(keyword)
      let url = page === 1
        ? `${GuoMan8.baseUrl}/search/q_${k}`
        : `${GuoMan8.baseUrl}/search/q_${k}-p-${page}`
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = comics.length > 0 ? this._maxPage(doc, page) : page
      return { comics: comics, maxPage: maxPage }
    },
  }

  // 详情页 .detail-list 里是 “<strong>漫画作者：</strong>...” 结构
  _parseInfo(doc) {
    let info = {}
    let tags = {}
    for (let span of doc.querySelectorAll(".detail-list li span")) {
      let strong = span.querySelector("strong")
      if (!strong) continue
      let label = strong.text.replace(/[:：]/g, "").trim()
      let text = span.text.replace(strong.text, "").replace(/\s+/g, " ").trim()
      if (label.indexOf("作者") >= 0) {
        let a = span.querySelector("a")
        info.author = a ? a.text.trim() : text
      } else if (label.indexOf("剧情") >= 0 || label.indexOf("类型") >= 0) {
        let arr = []
        for (let a of span.querySelectorAll("a")) {
          let t = a.text.trim()
          if (t) arr.push(t)
        }
        if (arr.length) tags["题材"] = arr
      } else if (label.indexOf("地区") >= 0) {
        info.area = text
      } else if (label.indexOf("年代") >= 0) {
        info.year = text.replace(/[^\d]/g, "")
      } else if (label.indexOf("状态") >= 0) {
        info.status = text.split("。")[0].trim()
        let m = text.match(/\[([\d-]+)\]/)
        if (m) info.updateTime = m[1]
      } else if (label.indexOf("字母") >= 0) {
        info.letter = text
      }
    }
    if (info.author) tags["作者"] = [info.author]
    if (info.status) tags["状态"] = [info.status]
    if (info.area) tags["地区"] = [info.area]
    if (info.year) tags["年代"] = [info.year]
    return { info: info, tags: tags }
  }

  static _chapterNum(title) {
    let m = title.match(/(\d+(?:\.\d+)?)/)
    if (!m) return null
    let n = parseFloat(m[1])
    return isNaN(n) ? null : n
  }

  // 章节默认按“最新在前”，整理成阅读顺序（第 1 话在前）
  _parseChapters(doc) {
    let items = []
    let box = doc.querySelector("#chpater-list-1") || doc.querySelector("#chapters")
    if (box) {
      for (let a of box.querySelectorAll("a")) {
        let href = a.attributes["href"] || ""
        if (!href || href.indexOf("javascript") === 0) continue
        let title = a.attributes["title"] || ""
        let span = a.querySelector("span")
        if (!title && span) {
          // <span>428 断龙斩<i>15p</i></span>：去掉页码
          let text = span.text
          let i = span.querySelector("i")
          if (i) text = text.replace(i.text, "")
          title = text.trim()
        }
        if (!title) title = a.text.trim()
        if (!href || !title) continue
        items.push([href, title])
      }
    }
    let numbered = 0
    for (let it of items) if (GuoMan8._chapterNum(it[1]) !== null) numbered++
    if (numbered === 0) {
      // 标题里没有话号：站点新章在前，倒序即阅读顺序
      items.reverse()
      return items
    }
    let sorted = items.map((it, idx) => ({ it: it, idx: idx, n: GuoMan8._chapterNum(it[1]) }))
    sorted.sort((a, b) => {
      if (a.n === null && b.n === null) return a.idx - b.idx
      if (a.n === null) return 1
      if (b.n === null) return -1
      if (a.n !== b.n) return a.n - b.n
      return a.idx - b.idx
    })
    return sorted.map((o) => o.it)
  }

  // 解 eval(function(p,a,c,k,e,d){...}) 打包，返回解包后的 JS 源码
  static unpack(html) {
    let scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || []
    for (let s of scripts) {
      let start = s.indexOf("eval(function(p,a,c,k,e,d)")
      if (start < 0) continue
      let body = s.slice(start).replace(/^eval\(/, "")
      let depth = 0, end = -1
      for (let i = 0; i < body.length; i++) {
        let c = body[i]
        if (c === "(") depth++
        else if (c === ")") { depth--; if (depth < 0) { end = i; break } }
      }
      if (end < 0) continue
      body = body.slice(0, end)
      try {
        return eval("(" + body + ")")
      } catch (e) {
        continue
      }
    }
    return null
  }

  // 解包后取 cInfo.fs（图片相对/绝对路径数组）
  static parseImages(html) {
    let src = GuoMan8.unpack(html)
    if (!src) return []
    let m = src.match(/['"]fs['"]\s*:\s*\[([\s\S]*?)\]/)
    if (!m) return []
    let files = []
    let re = /'([^']*)'/g, mm
    while ((mm = re.exec(m[1])) !== null) {
      if (mm[1]) files.push(mm[1])
    }
    return files
  }

  comic = {
    loadInfo: async (id) => {
      let url = this._abs(id)
      let res = await this._get(url)
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".book-title h1") || doc.querySelector("h1")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".hcover img")
      let cover = coverEl ? (coverEl.attributes["src"] || coverEl.attributes["data-src"]) : null

      let descEl = doc.querySelector("#intro-all") || doc.querySelector("#intro-cut")
      let desc = descEl ? descEl.text.trim() : null

      let parsed = this._parseInfo(doc)

      let chapters = new Map()
      for (let [href, name] of this._parseChapters(doc)) {
        chapters.set(this._abs(href), name)
      }

      return new ComicDetails({
        title: title,
        subtitle: parsed.info.status || null,
        cover: cover,
        description: desc,
        tags: parsed.tags,
        chapters: chapters,
        updateTime: parsed.info.updateTime || null,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = this._abs(epId)
      let res = await this._get(url, { ...this.headers, "Referer": this._abs(comicId) })
      let files = GuoMan8.parseImages(res.body)
      if (!files.length) throw "获取图片失败"

      // 相对路径统一挂到图床；/manhuatuku/ 老图在 images.tingliu.cc 上实测可取
      let host = GuoMan8.imgHost
      if (files[0].charAt(0) === "/" && files[0].indexOf("/manhuatuku/") === 0) {
        host = GuoMan8.imgHostTingliu
      }
      let images = []
      for (let f of files) {
        if (f.indexOf("http") === 0) images.push(f)
        else images.push(host + (f.charAt(0) === "/" ? f : "/" + f))
      }
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 实测新图床 tukaobei.haotu90.top 不带 Referer 也返回真图，仍显式带上 Referer
      return {
        headers: {
          "User-Agent": GuoMan8.ua,
          "Referer": `${GuoMan8.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // 站点图床有多个：失败时换一个镜像主机重试
        onLoadFailed: () => {
          let cfg = {
            headers: {
              "User-Agent": GuoMan8.ua,
              "Referer": `${GuoMan8.baseUrl}/`,
            },
          }
          let alt = GuoMan8.fallbackUrl(url)
          if (alt) cfg.url = alt
          return cfg
        },
      }
    },
  }

  static fallbackUrl(url) {
    if (!url) return null
    // js.tingliu.cc 与 tukaobei.haotu90.top 是同一套 /images/ 存储
    if (url.indexOf("js.tingliu.cc") >= 0) return url.replace("js.tingliu.cc", "tukaobei.haotu90.top")
    if (url.indexOf("imagesold.502215.com") >= 0) return url.replace("imagesold.502215.com", "images.tingliu.cc")
    if (url.indexOf("images.tingliu.cc") >= 0) return url.replace("images.tingliu.cc", "imagesold.502215.com")
    if (url.indexOf("images.720rs.com") >= 0) return url.replace("images.720rs.com", "images.tingliu.cc")
    return null
  }
}
