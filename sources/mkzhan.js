class Mkzhan extends ComicSource {
  name = "漫客栈"

  key = "mkzhan"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/mkzhan.js"

  static baseUrl = "https://www.mkzhan.com"

  // 章节图片接口（网页端 read/content.js 调用，无需登录）
  static apiBase = "https://comic.mkzcdn.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": Mkzhan.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  // 分类页 /category/?参数 ，站点没有年份筛选参数
  static categories = [
    ["全部", "category/?order=1"],
    ["更新时间", "category/?order=2"],
    ["连载", "category/?finish=1"],
    ["完结", "category/?finish=2"],
    ["免费", "category/?is_free=1"],
    ["VIP", "category/?is_vip=1"],
    ["独家", "category/?copyright=1"],
    ["少年", "category/?audience=1"],
    ["少女", "category/?audience=2"],
    ["青年", "category/?audience=3"],
    ["霸总", "category/?theme_id=1"],
    ["修真", "category/?theme_id=2"],
    ["恋爱", "category/?theme_id=3"],
    ["校园", "category/?theme_id=4"],
    ["冒险", "category/?theme_id=5"],
    ["搞笑", "category/?theme_id=6"],
    ["热血", "category/?theme_id=8"],
    ["玄幻", "category/?theme_id=12"],
    ["悬疑", "category/?theme_id=13"],
    ["恐怖", "category/?theme_id=14"],
    ["古风", "category/?theme_id=19"],
    ["穿越", "category/?theme_id=20"],
    ["竞技", "category/?theme_id=21"],
    ["百合", "category/?theme_id=22"],
  ]

  // 列表解析：搜索页与分类页共用 .common-comic-item
  _parseList(doc) {
    let comics = []
    for (let item of doc.querySelectorAll(".common-comic-item")) {
      let coverEl = item.querySelector("a.cover")
      let titleEl = item.querySelector(".comic__title")
      let imgEl = item.querySelector("img")
      if (!coverEl || !titleEl) continue
      let href = coverEl.attributes["href"]
      if (!href || href.indexOf("/") !== 0) continue
      let title = titleEl.text.trim()
      if (!title && imgEl) title = (imgEl.attributes["alt"] || "").trim()
      if (!title) continue
      let updateEl = item.querySelector(".comic-update")
      comics.push(new Comic({
        id: href,
        title: title,
        cover: imgEl ? (imgEl.attributes["data-src"] || imgEl.attributes["src"]) : null,
        subtitle: updateEl ? updateEl.text.trim() : null,
        tags: [],
      }))
    }
    return comics
  }

  static _maxPage(doc, page) {
    let end = doc.querySelector("#Pagination a.end")
    if (end && end.attributes["href"]) {
      let m = end.attributes["href"].match(/page=(\d+)/)
      if (m) return parseInt(m[1])
    }
    for (let p of doc.querySelectorAll(".cate-container__title p")) {
      let m = p.text.match(/共\s*(\d+)\s*条/)
      if (m) {
        let total = parseInt(m[1])
        return total > 0 ? Math.ceil(total / 30) : page
      }
    }
    return page
  }

  explore = Mkzhan.categories.map(([label, path]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = `${Mkzhan.baseUrl}/${path}&page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      let maxPage = Mkzhan._maxPage(doc, page)
      return { comics: comics, maxPage: comics.length > 0 ? maxPage : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      // 站点未收录该关键词时也会返回「为您推荐」列表（页面 data-count=0），照实解析
      let url = `${Mkzhan.baseUrl}/search/?keyword=${encodeURIComponent(keyword)}&page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let comics = this._parseList(doc)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let url = id.startsWith("http") ? id : `${Mkzhan.baseUrl}${id}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector(".j-comic-title")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".de-info__cover img")
      let descEl = doc.querySelector(".comic-intro .intro-total") || doc.querySelector(".comic-intro .intro")

      let authorEl = doc.querySelector(".comic-author .name")
      let author = authorEl ? authorEl.text.trim() : null

      let tags = []
      let classEl = doc.querySelector(".comic-status .text")
      if (classEl) {
        let t = classEl.text.replace(/^[^:：]*[:：]/, "").trim()
        for (let part of t.split(/\s+/)) if (part) tags.push(part)
      }

      // 章节列表（页面为倒序，按话号升序整理成阅读顺序）
      let items = []
      for (let a of doc.querySelectorAll("a.j-chapter-link")) {
        let href = a.attributes["data-hreflink"] || a.attributes["href"]
        let name = a.text.replace(/\s+/g, " ").trim()
        if (href && name) items.push([href, name])
      }
      items.reverse()
      let chapters = new Map()
      for (let [href, name] of items) chapters.set(href, name)

      let subtitle = null
      let statusEl = doc.querySelector(".de-chapter__title span")
      if (statusEl) subtitle = statusEl.text.trim()
      let updateTime = null
      let updateEl = doc.querySelector(".update-time")
      if (updateEl) updateTime = updateEl.text.trim()

      return new ComicDetails({
        title: title,
        subtitle: subtitle,
        cover: coverEl ? (coverEl.attributes["data-src"] || coverEl.attributes["src"]) : null,
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let ids = Mkzhan._splitIds(epId)
      if (!ids) throw "章节地址无效"
      let apiUrl = `${Mkzhan.apiBase}/chapter/content/?comic_id=${ids[0]}&chapter_id=${ids[1]}`
      let headers = Object.assign({}, this.headers, {
        "Referer": `${Mkzhan.baseUrl}/${ids[0]}/${ids[1]}.html`,
        "Accept": "application/json, text/javascript, */*; q=0.01",
      })
      let res = await Network.get(apiUrl, headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let json
      try {
        json = JSON.parse(res.body)
      } catch (e) {
        throw "章节数据解析失败"
      }
      if (String(json.code) !== "200") throw json.message || "获取章节图片失败（可能是付费章节）"
      let list = json.data || []
      let images = []
      for (let p of list) {
        let img = p && p.image
        if (!img) continue
        images.push(img.replace(/^http:/, "https:"))
      }
      if (!images.length) throw "获取章节图片失败"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 实测 oss.mkzcdn.com 不校验 Referer，但部分镜像/防盗链节点会校验，统一带上
      return {
        headers: {
          "User-Agent": Mkzhan.ua,
          "Referer": `${Mkzhan.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // CDN 偶发重置连接：失败时用同样请求头重试
        onLoadFailed: () => ({
          headers: {
            "User-Agent": Mkzhan.ua,
            "Referer": `${Mkzhan.baseUrl}/`,
          },
        }),
      }
    },
  }

  // "/217081/1069385.html" -> ["217081","1069385"]
  static _splitIds(epId) {
    let s = String(epId).split("?")[0].replace(/\.html?$/i, "")
    let parts = s.split("/")
    let out = []
    for (let p of parts) if (/^\d+$/.test(p)) out.push(p)
    if (out.length < 2) return null
    return [out[out.length - 2], out[out.length - 1]]
  }
}
