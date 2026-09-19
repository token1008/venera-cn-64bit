class JiSuManHua extends ComicSource {
  name = "极速漫画"

  key = "jisu_1kkk"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/jisu_1kkk.js"

  static baseUrl = "http://m.1kkk.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": JiSuManHua.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  static categories = [
    ["全部", "manhua-list"],
    ["最近更新", "manhua-updated"],
    ["原创", "manhua-original"],
    ["日漫", "manhua-jpkr"],
    ["完结", "manhua-completed"],
    ["热血", "manhua-rexue"],
    ["恋爱", "manhua-aiqing"],
    ["校园", "manhua-xiaoyuan"],
    ["冒险", "manhua-maoxian"],
    ["科幻", "manhua-kehuan"],
    ["搞笑", "manhua-gaoxiao"],
    ["奇幻", "manhua-qihuan"],
    ["恐怖", "manhua-kongbu"],
    ["悬疑", "manhua-xuanyi"],
    ["治愈", "manhua-zhiyu"],
    ["后宫", "manhua-hougong"],
    ["百合", "manhua-baihe"],
    ["耽美", "manhua-danmei"],
    ["职场", "manhua-zhichang"],
    ["历史", "manhua-lishi"],
    ["美食", "manhua-meishi"],
    ["同人", "manhua-tongren"],
    ["运动", "manhua-jingji"],
    ["机甲", "manhua-jizhan"],
    ["侦探", "manhua-zhentan"],
    ["战争", "manhua-zhanzheng"],
  ]

  _parseList(doc) {
    let comics = []
    for (let li of doc.querySelectorAll("li")) {
      let titleEl = li.querySelector(".book-list-info-title") || li.querySelector(".manga-list-2-title") || li.querySelector(".rank-list-info-right-title")
      let coverEl = li.querySelector(".book-list-cover-img") || li.querySelector(".manga-list-2-cover-img") || li.querySelector(".rank-list-cover-img")
      let linkEl = li.querySelector("a")
      if (!titleEl || !linkEl) continue
      let href = linkEl.attributes["href"]
      if (!href || href.indexOf("/manhua") !== 0) continue
      let title = titleEl.text.trim()
      if (!title) continue
      let comic = new Comic({
        id: href,
        title: title,
        cover: coverEl ? (coverEl.attributes["src"] || coverEl.attributes["data-src"]) : null,
        subtitle: li.querySelector(".book-list-info-bottom-right-font") ? li.querySelector(".book-list-info-bottom-right-font").text.trim() : null,
        tags: [],
      })
      comics.push(comic)
    }
    return comics
  }

  explore = JiSuManHua.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = page === 1
        ? `${JiSuManHua.baseUrl}/${path}/`
        : `${JiSuManHua.baseUrl}/${path}-p${page}/`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      let url = `${JiSuManHua.baseUrl}/search?title=${encodeURIComponent(keyword)}&language=1&page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
    optionList: [
      {
        type: "select",
        options: ["1-简体", "2-繁體"],
        label: "语言",
        default: "1",
      },
    ],
  }

  account = {
    // 极速漫画登录带"旋转图片验证码"，无法用账号密码直接登录，改用内置网页登录。
    loginWithWebview: {
      url: `${JiSuManHua.baseUrl}/login/`,
      checkStatus: (url, title) => {
        // 登录成功后站点会跳离登录页
        return url.indexOf("/login") < 0 && title.indexOf("登录") < 0
      },
      onLoginSuccess: () => {},
    },
    logout: () => {
      Network.deleteCookies(JiSuManHua.baseUrl)
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${JiSuManHua.baseUrl}${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".detail-main-info-title")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".detail-main-cover") ? doc.querySelector(".detail-main-cover").querySelector("img") : null
      let descEl = doc.querySelector(".detail-desc")

      let authorEl = doc.querySelector(".detail-main-info-author")
      let author = authorEl ? authorEl.text.replace(/^作者：/, "").trim() : null

      let tags = []
      let classEl = doc.querySelector(".detail-main-info-class")
      if (classEl) for (let a of classEl.querySelectorAll("a")) {
        let t = a.text.trim()
        if (t) tags.push(t)
      }

      // 章节列表（站点为倒序，按话号升序整理）
      let chapters = new Map()
      let items = []
      for (let a of doc.querySelectorAll("a")) {
        let cls = a.classNames || []
        if (cls.indexOf("chapteritem") >= 0) {
          let href = a.attributes["href"]
          let name = a.text.trim()
          if (href && name) items.push([href, name])
        }
      }
      items.reverse()
      for (let [href, name] of items) chapters.set(href, name)

      // 连载状态 / 更新时间
      let subtitle = null
      let statusEl = doc.querySelector(".detail-main-info-status")
      if (statusEl) subtitle = statusEl.text.trim()
      let updateTime = null
      for (let p of doc.querySelectorAll("p")) {
        let t = p.text.trim()
        let m = t.match(/更新[：:]\s*(.+)$/)
        if (m) { updateTime = m[1].trim(); break }
      }

      return new ComicDetails({
        title: title,
        subtitle: subtitle,
        cover: coverEl ? (coverEl.attributes["src"] || coverEl.attributes["data-src"]) : null,
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId.startsWith("http") ? epId : `${JiSuManHua.baseUrl}${epId}`
      let res = await Network.get(url, { ...this.headers, "Referer": `${JiSuManHua.baseUrl}${comicId}` })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      // 图片列表被打包在 eval(function(p,a,c,k,e,d){...}) 里，解包后得到 var newImgs=[...]
      let images = JiSuManHua.unpackImages(res.body)
      if (!images.length) throw "获取图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片 CDN（*.cdndm5.com）强校验 Referer，缺失即 404 —— 阅读器黑屏的根因
      return {
        headers: {
          "User-Agent": JiSuManHua.ua,
          "Referer": `${JiSuManHua.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // 该 CDN 会偶发重置连接，失败时按同样请求头重试一次
        onLoadFailed: () => ({
          headers: {
            "User-Agent": JiSuManHua.ua,
            "Referer": `${JiSuManHua.baseUrl}/`,
          },
        }),
      }
    },
  }

  static unpackImages(html) {
    let scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || []
    for (let s of scripts) {
      let start = s.indexOf("eval(function(p,a,c,k,e,d)")
      if (start < 0) continue
      let body = s.slice(start).replace(/^eval\(/, "")
      // 截到与开头 eval( 配对的右括号
      let depth = 0, end = -1
      for (let i = 0; i < body.length; i++) {
        let c = body[i]
        if (c === "(") depth++
        else if (c === ")") { depth--; if (depth < 0) { end = i; break } }
      }
      if (end < 0) continue
      body = body.slice(0, end)
      let out
      try {
        out = eval("(" + body + ")")
      } catch (e) {
        continue
      }
      let m = out.match(/newImgs\s*=\s*(\[[\s\S]*?\])/)
      if (!m) continue
      let urls = []
      let re = /'([^']+)'/g, mm
      while ((mm = re.exec(m[1])) !== null) urls.push(mm[1])
      if (urls.length) return urls
    }
    return []
  }
}
