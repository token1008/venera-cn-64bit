class ZhiYinManKe extends ComicSource {
  name = "知音漫客"

  key = "zymk"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/zymk.js"

  static baseUrl = "https://m.zymk.cn"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  static coverRoot = "https://chapter-cover.yyhao.com/file/cover"

  static picHost = "https://mhpic.yyhao.com/comic/"

  get headers() {
    return {
      "User-Agent": ZhiYinManKe.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  get apiHeaders() {
    return {
      "User-Agent": ZhiYinManKe.ua,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": ZhiYinManKe.baseUrl + "/",
      "X-Requested-With": "XMLHttpRequest",
    }
  }

  // type 取自 m.zymk.cn/sort/<id>.html（站点分类页），只保留移动端有数据的分类
  static categories = [
    ["全部", "all"],
    ["热血", "5"],
    ["搞笑", "6"],
    ["玄幻", "7"],
    ["生活", "8"],
    ["恋爱", "9"],
    ["动作", "10"],
    ["战争", "12"],
    ["历史", "16"],
    ["穿越", "17"],
    ["后宫", "18"],
    ["都市", "20"],
    ["漫改", "22"],
    ["连载", "23"],
    ["完结", "24"],
    ["少男", "25"],
    ["少女", "26"],
    ["青年", "27"],
    ["修真", "53"],
    ["霸总", "62"],
    ["古风", "63"],
    ["游戏", "64"],
    ["武侠", "66"],
  ]

  static coverUrl(comicId) {
    let id = String(comicId)
    while (id.length < 9) id = "0" + id
    return `${ZhiYinManKe.coverRoot}/${id.slice(0, 3)}/${id.slice(3, 6)}/${id.slice(6, 9)}.jpg-300x400`
  }

  _comicFromApi(item) {
    let last = item.last_chapter && item.last_chapter.name ? item.last_chapter.name : null
    return new Comic({
      id: String(item.comic_id),
      title: item.comic_name,
      cover: ZhiYinManKe.coverUrl(item.comic_id),
      subtitle: last ? "更新至 " + last : null,
      description: item.comic_feature || null,
      stars: typeof item.score === "number" ? item.score : null,
    })
  }

  _parseList(body) {
    let json
    try {
      json = JSON.parse(body)
    } catch (e) {
      throw "接口返回解析失败"
    }
    let list = (json && json.data && json.data.page && json.data.page.comic_list) || []
    let comics = []
    for (let item of list) comics.push(this._comicFromApi(item))
    return comics
  }

  explore = ZhiYinManKe.categories.map(([label, type]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = `${ZhiYinManKe.baseUrl}/apinew/getsortlist_new?type=${type}&sort=click&page=${page}&client-type=wap`
      let res = await Network.get(url, this.apiHeaders)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = this._parseList(res.body)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      // 站点搜索：/sort/all.html?key=xxx 对应的接口（key 必填，移动端只会返回可在手机端阅读的作品）
      let url = `${ZhiYinManKe.baseUrl}/apinew/getsortlist_new?key=${encodeURIComponent(keyword)}&page=${page}&client-type=wap`
      let res = await Network.get(url, this.apiHeaders)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = this._parseList(res.body)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let comicId = String(id).replace(/[^0-9]/g, "")
      if (!comicId) throw "无效的漫画ID"
      let url = `${ZhiYinManKe.baseUrl}/${comicId}/`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector("h1.name")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) {
        throw "漫画不存在或已下架"
      }

      let coverEl = doc.querySelector(".comic-info img.thumbnail") || doc.querySelector(".comic-info img")
      let authorEl = doc.querySelector("span.author")
      let descEl = doc.querySelector(".comic-detail p.content")

      let tags = []
      for (let a of doc.querySelectorAll("ul.tags-box li.tags a")) {
        let t = a.text.trim()
        if (t && tags.indexOf(t) < 0) tags.push(t)
      }

      let stars = null
      let scoreEl = doc.querySelector(".cover-bg .score") || doc.querySelector(".comic-item .score")
      if (scoreEl) {
        let s = parseFloat(scoreEl.text)
        if (!isNaN(s)) stars = s
      }

      let updateTime = null
      let timeEl = doc.querySelector("#updateTime")
      if (timeEl) updateTime = timeEl.text.trim()

      // 目录默认倒序（最新话在前），倒转成阅读顺序（第 1 话在前）
      let items = []
      let lis = doc.querySelectorAll("ul.chapterlist li")
      for (let i = 0; i < lis.length; i++) {
        let li = lis[i]
        let a = li.querySelector("a.chapterBtn") || li.querySelector("a")
        if (!a) continue
        let href = a.attributes["href"]
        if (!href) continue
        let name = a.text.trim()
        if (!name) continue
        if (href.indexOf("http") === 0) {
          items.push([href, name])
        } else {
          if (href.indexOf("./") === 0) href = href.slice(2)
          if (href.charAt(0) !== "/") href = "/" + comicId + "/" + href
          items.push([href, name])
        }
      }
      items.reverse()
      let chapters = new Map()
      for (let it of items) chapters.set(it[0], it[1])

      if (!chapters.size) throw "未获取到章节列表"
      return new ComicDetails({
        title: title,
        subtitle: null,
        cover: coverEl ? (coverEl.attributes["data-src"] || coverEl.attributes["src"]) : ZhiYinManKe.coverUrl(comicId),
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": authorEl ? [authorEl.text.trim()] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        stars: stars,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId
      if (url.indexOf("http") !== 0) url = ZhiYinManKe.baseUrl + (url.charAt(0) === "/" ? url : "/" + comicId + "/" + url)
      let res = await Network.get(url, { ...this.headers, "Referer": `${ZhiYinManKe.baseUrl}/${comicId}/` })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      // 阅读页内联 __cr.init({...}) 数据：start_var/end_var 为页码范围，
      // chapter_addr_original + comic_size 拼出图片地址
      let images = ZhiYinManKe.extractImages(res.body)
      if (!images.length) throw "本章暂无图片（可能已下架或需要付费/登录）"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片 CDN(mhpic.yyhao.com) 实测可直接访问，带上 Referer 更稳妥
      return {
        headers: {
          "User-Agent": ZhiYinManKe.ua,
          "Referer": `${ZhiYinManKe.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // CDN 偶发重置连接，失败时用同样请求头重试一次
        onLoadFailed: () => ({
          headers: {
            "User-Agent": ZhiYinManKe.ua,
            "Referer": `${ZhiYinManKe.baseUrl}/`,
          },
        }),
      }
    },
  }

  static extractImages(html) {
    let startM = html.match(/start_var\s*:\s*(\d+)\s*,\s*end_var\s*:\s*(\d+)/)
    if (!startM) return []
    let start = parseInt(startM[1], 10)
    let end = parseInt(startM[2], 10)
    if (end < start) return []

    let host = ZhiYinManKe.picHost
    let domainM = html.match(/domain\s*:\s*"([^"]+)"/)
    if (domainM && domainM[1]) host = "https://mhpic." + domainM[1] + "/comic/"

    // 路径 + 后缀：优先用 chapter_addr_original + image_suffix + comic_size
    let addr = null
    let suffix = null
    let addrM = html.match(/chapter_addr_original\s*:\s*"([^"]*)"/)
    if (addrM && addrM[1]) addr = addrM[1]
    if (addr) {
      let sM = html.match(/image_suffix\s*:\s*"([^"]*)"/)
      let cM = html.match(/comic_size\s*:\s*"([^"]*)"/)
      suffix = (sM && sM[1] ? sM[1] : ".jpg") + (cM && cM[1] ? cM[1] : "-zymk.middle")
    } else {
      // 退路：解析 chapter_image 模板，如 "Y/元尊/预告/$$.jpg-zymk.middle.webp"
      let tplM = html.match(/chapter_image\s*:\s*\{[^}]*?middle\s*:\s*"([^"]+)"/)
      if (tplM && tplM[1]) {
        let tpl = tplM[1]
        let p = tpl.indexOf("$$")
        if (p >= 0) {
          addr = tpl.slice(0, p)
          suffix = tpl.slice(p + 2).replace(/\.webp$/i, "")
        }
      }
    }
    if (!addr || !suffix) return []

    let images = []
    for (let n = start; n <= end; n++) images.push(host + addr + n + suffix)
    return images
  }
}
