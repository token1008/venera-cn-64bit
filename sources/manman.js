class ManMan extends ComicSource {
  name = "漫漫漫画"

  key = "manman"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/manman.js"

  // 桌面站点 www.manmanapp.com 只做跳转，内容页在移动站
  static baseUrl = "https://m.manmanapp.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": ManMan.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  static categories = [
    ["女频", 21],
    ["男频", 20],
    ["奇幻", 29],
    ["重生", 28],
    ["逆袭", 27],
    ["穿越", 26],
    ["虐恋", 25],
    ["西幻", 24],
    ["后宫", 23],
    ["玄幻", 22],
    ["恋爱", 4],
    ["都市", 18],
    ["霸总", 9],
    ["古风", 7],
    ["搞笑", 6],
    ["暖萌", 10],
    ["日常", 12],
    ["悬疑", 15],
    ["仙侠", 16],
    ["热血", 17],
    ["恐怖", 19],
  ]

  _parseList(doc) {
    let comics = []
    for (let li of doc.querySelectorAll(".classification_list li")) {
      let a = li.querySelector("a")
      if (!a) continue
      let href = a.attributes["href"]
      if (!href || href.indexOf("/comic-") !== 0) continue
      let titleEl = li.querySelector("h3")
      let title = titleEl ? titleEl.text.trim() : null
      let imgEl = li.querySelector("img.pic") || li.querySelector("img")
      if (!title && imgEl) title = (imgEl.attributes["alt"] || "").trim()
      if (!title) continue
      let authorEl = li.querySelector(".author")
      comics.push(new Comic({
        id: href,
        title: title,
        cover: imgEl ? (imgEl.attributes["data-original"] || imgEl.attributes["src"]) : null,
        subtitle: authorEl ? authorEl.text.trim() : null,
        tags: [],
      }))
    }
    return comics
  }

  static _comicFromJson(it) {
    return new Comic({
      id: `/comic-${it.id}.html`,
      title: it.title,
      cover: it.cover_image_url || null,
      subtitle: it.author ? it.author.nickname : null,
      tags: [],
    })
  }

  explore = ManMan.categories.map(([label, cid]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let comics
      if (page <= 1) {
        let url = `${ManMan.baseUrl}/comic/category-${cid}.html`
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let doc = new HtmlDocument(res.body)
        comics = this._parseList(doc)
      } else {
        let res = await Network.post(
          `${ManMan.baseUrl}/category/list-ajax.html`,
          Object.assign({}, this.headers, {
            "Referer": `${ManMan.baseUrl}/comic/category-${cid}.html`,
            "X-Requested-With": "XMLHttpRequest",
          }),
          `id=${cid}&page=${page}`
        )
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let json
        try {
          json = JSON.parse(res.body)
        } catch (e) {
          json = null
        }
        comics = []
        if (json && String(json.code) === "1") {
          for (let it of json.data || []) comics.push(ManMan._comicFromJson(it))
        }
      }
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      let comics = []
      if (page <= 1) {
        let url = `${ManMan.baseUrl}/search/search.html?keyword=${encodeURIComponent(keyword)}`
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let doc = new HtmlDocument(res.body)
        comics = this._parseList(doc)
      } else {
        // 搜索结果第 2 页起由 /search/search-ajax.html 返回 JSON
        let res = await Network.post(
          `${ManMan.baseUrl}/search/search-ajax.html`,
          Object.assign({}, this.headers, {
            "Referer": `${ManMan.baseUrl}/search/search.html?keyword=${encodeURIComponent(keyword)}`,
            "X-Requested-With": "XMLHttpRequest",
          }),
          `keyword=${encodeURIComponent(keyword)}&page=${page}`
        )
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let json
        try {
          json = JSON.parse(res.body)
        } catch (e) {
          json = null
        }
        if (json && String(json.code) === "1") {
          for (let it of json.data || []) comics.push(ManMan._comicFromJson(it))
        }
      }
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }

  comic = {
    loadInfo: async (id) => {
      let m = String(id).match(/(\d+)/)
      if (!m) throw "Comic id not found"
      let cid = m[1]
      let url = `${ManMan.baseUrl}/comic-${cid}.html`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      // 页头标题干净；.cover .title 会附带 <strong>独家</strong> 标记
      let titleEl = doc.querySelector("header .title")
      let title = titleEl ? titleEl.text.replace(/\s+/g, " ").trim() : null
      if (!title) {
        let coverTitle = doc.querySelector(".cover .title")
        if (coverTitle) {
          title = coverTitle.text.replace(/\s+/g, " ").trim()
          let badge = coverTitle.querySelector("strong")
          if (badge && badge.text) title = title.replace(badge.text.trim(), "").trim()
        }
      }
      if (!title) throw "Comic not found"

      let coverEl = doc.querySelector(".cover .pic img")
      let authorEl = doc.querySelector(".cover .author")
      let author = authorEl ? authorEl.text.replace(/^[^:：]*[:：]/, "").trim() : null
      let typeEl = doc.querySelector(".cover .type")
      let tags = []
      if (typeEl) {
        let t = typeEl.text.replace(/^[^:：]*[:：]/, "").trim()
        for (let part of t.split(/[,，]/)) {
          part = part.trim()
          if (part) tags.push(part)
        }
      }
      let descEl = doc.querySelector(".introduce p")
      let numberEl = doc.querySelector(".cover .number")

      // 目录接口每页 5 条，sort=1 为正序；并发抓取后合并成阅读顺序
      let chapters = new Map()
      let updateTime = null
      let page = 1
      let done = false
      while (!done && page <= 100) {
        let batch = await ManMan._chapterBatch(cid, page, 8, this.headers)
        for (let r of batch) {
          if (!r || String(r.code) !== "1") { done = true; break }
          let list = r.data || []
          for (let ch of list) {
            if (!ch || ch.id === undefined) continue
            let t = String(ch.title || "").replace(/\s+/g, " ").trim()
            chapters.set(String(ch.id), t)
            if (ch.publish_time && (!updateTime || ch.publish_time > updateTime)) updateTime = ch.publish_time
          }
          if (list.length < 5) { done = true; break }
        }
        page += 8
      }
      if (chapters.size === 0) throw "获取章节列表失败"

      return new ComicDetails({
        title: title,
        subtitle: numberEl ? numberEl.text.trim() : null,
        cover: coverEl ? (coverEl.attributes["data-original"] || coverEl.attributes["src"]) : null,
        description: descEl ? descEl.text.replace(/^作品简介[：:]/, "").trim() : null,
        tags: { "作者": author ? [author] : [], "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let m = String(epId).match(/(\d+)/)
      if (!m) throw "章节地址无效"
      let url = `${ManMan.baseUrl}/comic/detail-${m[1]}.html`
      let headers = Object.assign({}, this.headers, {
        "Referer": `${ManMan.baseUrl}/comic-${String(comicId).replace(/[^\d]/g, "")}.html`,
      })
      let res = await Network.get(url, headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)
      let images = []
      for (let img of doc.querySelectorAll("ul.cartoon li img")) {
        let src = img.attributes["data-original"] || img.attributes["src"]
        if (!src) continue
        if (src.indexOf("http") !== 0) continue
        images.push(src)
      }
      if (!images.length) throw "本章为付费章节，需在漫漫漫画 App 内购买后阅读"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // images.manmanapp.com 实测不校验 Referer，仍统一带上以防 CDN 改成防盗链
      return {
        headers: {
          "User-Agent": ManMan.ua,
          "Referer": `${ManMan.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        onLoadFailed: () => ({
          headers: {
            "User-Agent": ManMan.ua,
            "Referer": `${ManMan.baseUrl}/`,
          },
        }),
      }
    },
  }

  // 目录接口：{id, sort:1 正序, page}，每页 5 条
  static async _chapterBatch(cid, startPage, size, baseHeaders) {
    let pages = []
    for (let i = 0; i < size; i++) pages.push(startPage + i)
    let headers = Object.assign({}, baseHeaders, {
      "Referer": `${ManMan.baseUrl}/comic-${cid}.html`,
      "X-Requested-With": "XMLHttpRequest",
    })
    let tasks = pages.map(async (p) => {
      try {
        let res = await Network.post(`${ManMan.baseUrl}/works/comic-list-ajax.html`, headers, `id=${cid}&sort=1&page=${p}`)
        if (res.status !== 200) return null
        return JSON.parse(res.body)
      } catch (e) {
        return null
      }
    })
    return await Promise.all(tasks)
  }
}
