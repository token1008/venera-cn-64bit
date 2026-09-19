class CiYuanDao extends ComicSource {
  name = "Cosplay啦"

  key = "ciyuandao"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/ciyuandao.js"

  static baseUrl = "http://ciyuandao.com"

  static imgHost = "img.ciyuandao.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": CiYuanDao.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": `${CiYuanDao.baseUrl}/photo`,
    }
  }

  // 列表路由：/photo/list/<分类>-<排序>-<页码>
  // 分类 0=不限 1=正片 2=私影 3=预告；排序 0=最新 1=精选 2=周榜 3=月榜 4=获赞数
  static categories = [
    ["最新", "0-0"],
    ["精选", "0-1"],
    ["周榜", "0-2"],
    ["月榜", "0-3"],
    ["获赞数", "0-4"],
    ["正片", "1-0"],
    ["私影", "2-0"],
    ["预告", "3-0"],
  ]

  _parseList(doc) {
    let comics = []
    for (let li of doc.querySelectorAll(".pics li")) {
      let titleEl = li.querySelector(".tits")
      let a = titleEl || li.querySelector("a")
      if (!a) continue
      let href = a.attributes["href"]
      let title = titleEl ? titleEl.text.trim() : a.text.trim()
      if (!href || href.indexOf("/photo/show/") !== 0 || !title) continue
      let imgEl = li.querySelector("img")
      let coserEl = li.querySelector(".blue.line")
      let timeEl = li.querySelector(".greyc")
      comics.push(new Comic({
        id: href,
        title: title,
        cover: imgEl ? CiYuanDao.fixImg(imgEl.attributes["src"] || imgEl.attributes["data-src"]) : null,
        subtitle: coserEl ? coserEl.text.trim() : null,
        tags: [],
        description: timeEl ? timeEl.text.trim() : null,
      }))
    }
    return comics
  }

  // OSS 图床同时支持 https，统一升级协议（站点自身是 http）
  static fixImg(u) {
    if (!u) return null
    if (u.indexOf("//") === 0) return "https:" + u
    if (u.indexOf("http://") === 0 && u.indexOf(CiYuanDao.imgHost) > 0) return "https://" + u.slice(7)
    return u
  }

  // 分页块 .pagen 里最大页码就是总页数（如 1 2 3 ... 512）
  _maxPage(doc, fallback) {
    let max = 0
    for (let a of doc.querySelectorAll(".pagen a")) {
      let t = (a.text || "").trim()
      if (!/^\d+$/.test(t)) continue
      let n = parseInt(t, 10)
      if (n > max) max = n
    }
    return max > 0 ? max : fallback
  }

  explore = CiYuanDao.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = `${CiYuanDao.baseUrl}/photo/list/${path}-${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = this._maxPage(doc, comics.length > 0 ? page + 1 : page)
      return { comics: comics, maxPage: maxPage }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      let kw = encodeURIComponent(keyword)
      // 站点搜索就是图集列表的一个查询参数：/photo/list[/<分类>-<排序>-<页码>]?key=xxx
      let url = page === 1
        ? `${CiYuanDao.baseUrl}/photo/list?key=${kw}`
        : `${CiYuanDao.baseUrl}/photo/list/0-0-${page}?key=${kw}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = this._maxPage(doc, comics.length > 0 ? page + 1 : page)
      return { comics: comics, maxPage: maxPage }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${CiYuanDao.baseUrl}${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector("h1")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let descEl = doc.querySelector(".article")
      let description = descEl ? descEl.text.trim() : null

      // 图集是单页 N 图：整本作为一个章节，loadEp 返回该页全部图片
      let images = CiYuanDao.pickImages(doc)
      if (!images.length) throw "该图集没有图片"

      // [正片] 共4P 发布日期：2026-08-05
      let meta = ""
      let metaEl = doc.querySelector(".font14.greyc span.fleft")
      if (metaEl) meta = metaEl.text.trim()
      let cat = ""
      let cm = meta.match(/\[([^\]]+)\]/)
      if (cm) cat = cm[1]
      let updateTime = ""
      let dm = meta.match(/发布日期[：:]\s*([0-9-]+)/)
      if (dm) updateTime = dm[1]

      // 角色名：<a>初音未来</a> CN：<a>洛城雪Yuki</a> —— 逐个“标签：链接”取值
      let tags = {}
      if (cat) tags["分类"] = [cat]
      for (let p of doc.querySelectorAll(".padding10 p.font14.greyc")) {
        let html = p.innerHtml || ""
        let re = /([^<>：:]{1,6})[：:]\s*<a[^>]*>([\s\S]*?)<\/a>/g
        let m
        while ((m = re.exec(html)) !== null) {
          let label = m[1].replace(/<[^>]*>/g, "").trim()
          let val = m[2].replace(/<[^>]*>/g, "").trim()
          if (!label || !val) continue
          if (tags[label]) tags[label].push(val)
          else tags[label] = [val]
        }
      }

      let chapters = new Map()
      chapters.set(id, `全图（${images.length}P）`)

      return new ComicDetails({
        title: title,
        subtitle: cat ? `[${cat}]` : null,
        cover: images[0],
        description: description,
        tags: tags,
        chapters: chapters,
        updateTime: updateTime,
        uploadTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId.startsWith("http") ? epId : `${CiYuanDao.baseUrl}${epId}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let images = CiYuanDao.pickImages(doc)
      if (!images.length) throw "获取图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 阿里云 OSS 图床不校验 Referer，带上更稳
      let h = {
        "User-Agent": CiYuanDao.ua,
        "Referer": `${CiYuanDao.baseUrl}/photo`,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      }
      return {
        headers: h,
        // 缩略（x-oss-process）失败时退回原图
        onLoadFailed: () => {
          let i = url.indexOf("?")
          if (i > 0) return { url: url.slice(0, i), headers: h }
          return { headers: h }
        },
      }
    },
  }

  // 正文图片容器 .talk_pic（页面底部的推荐位/侧栏也用 .pics，必须排除）
  static pickImages(doc) {
    let images = []
    for (let img of doc.querySelectorAll(".talk_pic img")) {
      let u = img.attributes["data-src"] || img.attributes["src"]
      u = CiYuanDao.fixImg(u)
      if (u && u.indexOf("http") === 0 && images.indexOf(u) < 0) images.push(u)
    }
    return images
  }
}
