class KanMan extends ComicSource {
  name = "看漫画"

  key = "kanman"

  version = "1.0.0"

  minAppVersion = "1.0.0"

  url = "https://cdn.jsdelivr.net/gh/token1008/venera-cn-64bit@main/sources/kanman.js"

  static baseUrl = "https://m.kanman.com"

  static ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

  get headers() {
    return {
      "User-Agent": KanMan.ua,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  get apiHeaders() {
    return {
      "User-Agent": KanMan.ua,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": KanMan.baseUrl + "/",
      "X-Requested-With": "XMLHttpRequest",
    }
  }

  // comic_sort 值取自 m.kanman.com/sort/*.html 页面的 window.sortConf.objSortQuery.comic_sort
  // （只保留移动端确实有数据的分类，站上空分类会返回 0 条）
  static categories = [
    ["全部", ""],
    ["热血", "rexue"],
    ["玄幻", "xuanhuan"],
    ["恋爱", "lianai"],
    ["古风", "gufeng"],
    ["搞笑", "gaoxiao"],
    ["穿越", "chuanyue"],
    ["修真", "xiuzhen"],
    ["都市", "dushi"],
    ["冒险", "maoxian"],
    ["生活", "shenghuo"],
    ["漫改", "mangai"],
    ["霸总", "bazong"],
    ["神魔", "shenmo"],
    ["武侠", "wuxia"],
    ["科幻", "kehuan"],
    ["游戏", "youxi"],
    ["动作", "dongzuo"],
    ["悬疑", "xuanyi"],
    ["战争", "zhanzhen"],
    ["历史", "lishi"],
    ["萝莉", "luoli"],
    ["连载", "lianzai"],
    ["完结", "wanjie"],
    ["精品", "jingpin"],
  ]

  static parseTags(comicType) {
    let tags = []
    if (!comicType) return tags
    for (let part of String(comicType).split("|")) {
      let seg = part.split(",")
      let name = (seg[1] || seg[0] || "").trim()
      if (name && tags.indexOf(name) < 0) tags.push(name)
    }
    return tags
  }

  static coverUrl(comicId) {
    return "https://image.yqmh.com/mh/" + comicId + ".jpg-300x400.jpg"
  }

  _comicFromApi(item) {
    let last = item.last_chapter_name || (item.last_chapter ? item.last_chapter.name : null)
    return new Comic({
      id: String(item.comic_id),
      title: item.comic_name,
      cover: KanMan.coverUrl(item.comic_id),
      subtitle: last ? "更新至 " + last : null,
      description: item.cartoon_desc || null,
      tags: KanMan.parseTags(item.comic_type),
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
    let list = (json && json.data && json.data.data) || []
    let comics = []
    for (let item of list) comics.push(this._comicFromApi(item))
    return comics
  }

  explore = KanMan.categories.map(([label, comicSort]) => ({
    title: label,
    type: "multiPageComicList",
    load: async (page) => {
      let url = `${KanMan.baseUrl}/api/getsortlist/?orderby=click&search_key=&comic_sort=${comicSort}&size=30&page=${page}`
      let res = await Network.get(url, this.apiHeaders)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let comics = this._parseList(res.body)
      return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
    },
  }))

  search = {
    load: async (keyword, options, page) => {
      // 站点搜索：/sort/all.html?search_key=xxx 对应的接口
      let url = `${KanMan.baseUrl}/api/getsortlist/?orderby=click&search_key=${encodeURIComponent(keyword)}&size=30&page=${page}`
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
      let url = `${KanMan.baseUrl}/${comicId}/`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let doc = new HtmlDocument(res.body)

      let titleEl = doc.querySelector("#js_comic_id") || doc.querySelector(".comic-title")
      let title = titleEl ? titleEl.text.trim() : null
      if (!title) {
        throw "漫画不存在或已下架"
      }

      let coverEl = doc.querySelector(".comic-detail-cover img")
      let descEl = doc.querySelector("#js_desc_content")

      let tags = []
      for (let a of doc.querySelectorAll(".comic-tags li.item a")) {
        let t = a.text.trim()
        if (t && tags.indexOf(t) < 0) tags.push(t)
      }

      // 作者：目录页第一组人物（ul.comic-figure），第二组是角色
      let authors = []
      let authorBox = doc.querySelector("ul.comic-figure")
      if (authorBox) {
        for (let a of authorBox.querySelectorAll(".figcaption-title a")) {
          let t = a.text.trim()
          if (t && authors.indexOf(t) < 0) authors.push(t)
        }
      }

      // 状态 / 更新时间：“连载中 最后更新于2025-01-25 1月25日请假条”
      let subtitle = null
      let updateTime = null
      let statusEl = doc.querySelector(".comic-update-status")
      if (statusEl) {
        let t = statusEl.text.trim()
        let m = t.match(/^(\S+?)\s+最后更新于\s*(\d{4}-\d{2}-\d{2})/)
        if (m) {
          subtitle = m[1]
          updateTime = m[2]
        } else {
          subtitle = t
        }
      }

      // 章节列表：data-index 即阅读顺序（第 1 话在前），按 index 升序放入 Map
      let items = []
      let lis = doc.querySelectorAll("#js_chapter_list li.item")
      for (let i = 0; i < lis.length; i++) {
        let li = lis[i]
        let a = li.querySelector("a.chapter-name") || li.querySelector("a")
        if (!a) continue
        let href = a.attributes["href"]
        if (!href) continue
        if (href.charAt(0) !== "/" && href.indexOf("http") !== 0) href = "/" + comicId + "/" + href
        let name = a.attributes["title"]
        if (!name) name = a.text.replace(/\d{2}-\d{2}/, "").trim()
        let idx = Number(li.attributes["data-index"])
        if (isNaN(idx)) idx = i + 1
        items.push([idx, href, name.trim()])
      }
      items.sort((x, y) => x[0] - y[0])
      let chapters = new Map()
      for (let it of items) chapters.set(it[1], it[2])

      if (!chapters.size) throw "未获取到章节列表"
      return new ComicDetails({
        title: title,
        subtitle: subtitle,
        cover: coverEl ? (coverEl.attributes["data-src"] || coverEl.attributes["src"]) : null,
        description: descEl ? descEl.text.trim() : null,
        tags: { "作者": authors, "题材": tags },
        chapters: chapters,
        updateTime: updateTime,
        url: url,
      })
    },

    loadEp: async (comicId, epId) => {
      let url = epId
      if (url.indexOf("http") !== 0) url = KanMan.baseUrl + (url.charAt(0) === "/" ? url : "/" + comicId + "/" + url)
      let res = await Network.get(url, { ...this.headers, "Referer": `${KanMan.baseUrl}/${comicId}/` })
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      // 阅读页内联 window.comicInfo.current_chapter.chapter_img_list = [...]
      // 图片地址带 auth_key（约 1 小时有效），每次打开章节都会重新取到新地址
      let images = KanMan.extractImages(res.body)
      if (!images.length) throw "本章暂无图片（可能已下架或需要付费/登录）"
      return { images: images }
    },

    onImageLoad: (url, comicId, epId) => {
      // 图片 CDN(hw-chapter*.kaimanhua.com) 无 auth_key 时 403；带上站点 Referer 更稳
      return {
        headers: {
          "User-Agent": KanMan.ua,
          "Referer": `${KanMan.baseUrl}/`,
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        // CDN 偶发重置连接，失败时用同样请求头重试一次
        onLoadFailed: () => ({
          headers: {
            "User-Agent": KanMan.ua,
            "Referer": `${KanMan.baseUrl}/`,
          },
        }),
      }
    },
  }

  static extractImages(html) {
    let m = html.match(/chapter_img_list\s*:\s*\[([\s\S]*?)\]/)
    if (!m) return []
    let urls = []
    let re = /"([^"]+)"/g
    let mm
    while ((mm = re.exec(m[1])) !== null) {
      let u = mm[1].replace(/\\\//g, "/").trim()
      if (u) urls.push(u)
    }
    return urls
  }
}
