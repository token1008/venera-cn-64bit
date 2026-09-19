class ManHuaBa extends ComicSource {
  name = "漫画吧网"

  key = "manhuaba"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/manhuaba.js"

  static baseUrl = "https://www.manhuaba.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  // 章节页图片列表的 AES-128-CBC 密钥（站点 pic-v2.js 内硬编码，2025-12 实测有效）
  static aesKey = "9S8$vJnU2ANeSRoF"

  // source_id=12 的图床：图片 URL 为相对路径时补全该主机
  static fallbackImageHost = "https://img1.baipiaoguai.org"

  get headers() {
    return {
      "User-Agent": ManHuaBa.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": `${ManHuaBa.baseUrl}/`,
    }
  }

  static categories = [
    ["国产漫画", "/category/list/1"],
    ["日本漫画", "/category/list/2"],
    ["韩国漫画", "/category/list/3"],
    ["欧美漫画", "/category/list/4"],
    ["最新更新", "/custom/update"],
    ["漫画热榜", "/custom/top"],
  ]

  _parseList(doc) {
    let comics = []
    // 分类/搜索列表
    for (let el of doc.querySelectorAll("a.module-poster-item")) {
      let href = el.attributes["href"]
      if (!href || href.indexOf("/comic/") !== 0) continue
      let titleEl = el.querySelector(".module-poster-item-title")
      let title = titleEl ? titleEl.text.trim() : (el.attributes["title"] || "").trim()
      if (!title) continue
      let imgEl = el.querySelector("img")
      let noteEl = el.querySelector(".module-item-note")
      let cover = null
      if (imgEl) cover = imgEl.attributes["data-original"] || imgEl.attributes["src"] || null
      comics.push(new Comic({
        id: href,
        title: title,
        cover: cover,
        subtitle: noteEl ? noteEl.text.trim() : null,
        tags: [],
      }))
    }
    if (comics.length) return comics
    // 热榜页（module-card-item 布局）
    for (let el of doc.querySelectorAll(".module-card-item")) {
      let a = el.querySelector("a.module-card-item-poster") || el.querySelector(".module-card-item-title a") || el.querySelector("a")
      if (!a) continue
      let href = a.attributes["href"]
      if (!href || href.indexOf("/comic/") !== 0) continue
      let titleEl = el.querySelector(".module-card-item-title")
      let title = titleEl ? titleEl.text.trim() : (a.attributes["title"] || "").trim()
      if (!title) continue
      let imgEl = el.querySelector("img")
      let cover = null
      if (imgEl) cover = imgEl.attributes["data-original"] || imgEl.attributes["src"] || null
      let noteEl = el.querySelector(".module-item-note")
      comics.push(new Comic({
        id: href,
        title: title,
        cover: cover,
        subtitle: noteEl ? noteEl.text.trim() : null,
        tags: [],
      }))
    }
    return comics
  }

  explore = ManHuaBa.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = page === 1 ? `${ManHuaBa.baseUrl}${path}` : `${ManHuaBa.baseUrl}${path}/page/${page}`
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
      // 站点搜索只返回单页结果（实测 ?page= 与 /page/N 均无第二页）
      let url = `${ManHuaBa.baseUrl}/search?key=${encodeURIComponent(keyword)}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      doc.dispose()
      return { comics: comics, maxPage: 1 }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${ManHuaBa.baseUrl}${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".module-info-heading h1") || doc.querySelector(".module-info-heading")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let coverImg = doc.querySelector(".module-info-poster img")
      let cover = null
      if (coverImg) cover = coverImg.attributes["data-original"] || coverImg.attributes["src"] || null

      let descEl = doc.querySelector(".module-info-introduction-content")
      let description = descEl ? descEl.text.trim() : null

      let tags = []
      for (let t of doc.querySelectorAll(".module-info-tag-link")) {
        let v = t.text.trim()
        if (v && tags.indexOf(v) < 0) tags.push(v)
      }

      let author = null, updateTime = null, latestChapter = null
      for (let item of doc.querySelectorAll(".module-info-item")) {
        let titleSpan = item.querySelector(".module-info-item-title")
        if (!titleSpan) continue
        let label = titleSpan.text.trim()
        let contentEl = item.querySelector(".module-info-item-content")
        let content = contentEl ? contentEl.text.trim() : ""
        if (label.indexOf("作者") >= 0) author = content
        else if (label.indexOf("更新") >= 0) updateTime = content
        else if (label.indexOf("连载") >= 0 || label.indexOf("状态") >= 0) latestChapter = content
      }

      // 章节列表：站点已按 第1话 → 最新话 正序输出
      let chapters = new Map()
      for (let a of doc.querySelectorAll(".module-play-list a")) {
        let href = a.attributes["href"]
        let name = a.attributes["title"] || a.text.trim()
        if (href && name) chapters.set(href, name.trim())
      }
      if (chapters.size === 0) {
        // 兜底：旧版模板的 chapteritem 列表（倒序展示，转成正序）
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
      }

      doc.dispose()
      return new ComicDetails({
        title: title,
        subtitle: latestChapter,
        cover: cover,
        description: description,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId.startsWith("http") ? epId : `${ManHuaBa.baseUrl}${epId}`
      let res = await Network.get(url, { ...this.headers, "Referer": comicId.startsWith("http") ? comicId : `${ManHuaBa.baseUrl}${comicId}` })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      let data = ManHuaBa.decryptParams(res.body)
      let images = []
      if (data && data.images && data.images.length) {
        for (let u of data.images) {
          let real = ManHuaBa.realImageUrl(u)
          if (real) images.push(real)
          else if (data.source_id === 12 && u && u.indexOf("http") !== 0) images.push(ManHuaBa.fallbackImageHost + u)
        }
      }
      if (!images.length) throw "获取图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图床强校验 Referer：直连 CDN 需 Referer=https://manhuafree.com/（本站镜像域名），
      // 站点图片代理 https://s2.325784.xyz/ 需 Referer=本站。缺失即 403/防盗链占位图（阅读器黑屏根因）
      let directUrl = url
      // CDN 上实际存储为 .webp，章节里的 .../1.jpg 直连是 404/占位图
      if (/\.jpg$/.test(directUrl)) directUrl = directUrl.replace(/\.jpg$/, ".webp")
      let directHeaders = {
        "User-Agent": ManHuaBa.ua,
        "Referer": `${ManHuaBa.imgReferer}/`,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      }
      let proxyHeaders = {
        "User-Agent": ManHuaBa.ua,
        "Referer": `${ManHuaBa.baseUrl}/`,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      }
      return {
        url: directUrl,
        headers: directHeaders,
        // 直连失败 → 改用站点图片代理重试（部分章节只有代理有图）
        onLoadFailed: () => ({ url: ManHuaBa.proxyUrl(url), headers: proxyHeaders }),
      }
    },
  }

  // 站点图片代理：https://s2.325784.xyz/<base64(原图URL)>
  static proxyHost = "https://s2.325784.xyz/"

  // 直连图床 CDN 放行的 Referer（站点镜像域名）
  static imgReferer = "https://manhuafree.com"

  static proxyUrl(realUrl) {
    try {
      let b64 = Convert.encodeBase64(Convert.encodeUtf8(realUrl))
      return ManHuaBa.proxyHost + encodeURIComponent(b64)
    } catch (e) {
      return realUrl
    }
  }

  // 代理 URL → 真实图床 URL；非代理 URL 原样返回
  static realImageUrl(u) {
    if (!u) return null
    if (u.indexOf(ManHuaBa.proxyHost) !== 0) return u.indexOf("http") === 0 ? u : null
    let b64 = u.slice(ManHuaBa.proxyHost.length)
    b64 = b64.replace(/%3D/gi, "=").replace(/%2F/gi, "/").replace(/%2B/gi, "+")
    try {
      let real = Convert.decodeUtf8(Convert.decodeBase64(b64))
      if (real && real.indexOf("http") === 0) return real
    } catch (e) {}
    return u
  }

  /**
   * 章节页把图片列表放在 `params = '...'` 里：
   * Base64 解码后前 16 字节是 IV，其后为 AES-128-CBC 密文，密钥见 aesKey。
   * 明文为 JSON： {source_id, host, images:[...]}
   */
  static decryptParams(html) {
    let m = html.match(/params\s*=\s*'([A-Za-z0-9+/=]+)'/)
    if (!m) return null
    let blob = new Uint8Array(Convert.decodeBase64(m[1]))
    if (blob.length <= 16) return null
    let iv = blob.slice(0, 16)
    let ct = blob.slice(16)
    let key = new Uint8Array(Convert.encodeUtf8(ManHuaBa.aesKey))
    let out
    try {
      out = Convert.decryptAesCbc(ct, key, iv)
    } catch (e) {
      return null
    }
    let text = Convert.decodeUtf8(out)
    try {
      return JSON.parse(text)
    } catch (e) {
      return null
    }
  }
}
