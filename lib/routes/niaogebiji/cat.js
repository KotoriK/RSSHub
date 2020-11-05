const got = require('@/utils/got');
const cheerio = require('cheerio');

/**
 * 在一个CheerioElement数组中查找有你想要的属性的元素
 * @author KotoriK
 * @param {Array<CheerioElement>} eles CheerioElement数组
 * @param {string} attrName 要查找的属性名称
 * @param {boolean} recursive 是否递归子节点
 * @returns 有你想要元素的数组
 */
function findAttributeFromNodes(eles, attrName, recursive = false) {
    for (const ele of eles) {
        if (ele.attribs && ele.attribs[attrName]) {
            return ele;
        }
        if (recursive && ele.children) {
            return findAttributeFromNodes(ele.children, attrName, true);
        }
    }
}

/**
 * 在一个CheerioElement数组中查找有你给的属性及对应的值的第一个元素
 * @author KotoriK
 * @param {Array<CheerioElement>} eles CheerioElement数组
 * @param {string} attrName 要查找的属性名称
 * @param {boolean} recursive 是否递归子节点
 * @returns 你想要的元素
 */
function findMatch(eles, attrName, value, recursive = false) {
    for (const ele of eles) {
        if (ele.attribs && ele.attribs[attrName] === value) {
            return ele;
        }
        if (recursive && ele.children) {
            return findMatch(ele.children, attrName, value, true);
        }
    }
}

module.exports = async (ctx) => {
    const cat_id = ctx.params.cat;
    const response = await got(`http://www.niaogebiji.com/cat/${cat_id}`);
    const $ = cheerio.load(response.data);
    const cat_name = $('h1').text();
    const articles = $('div.articleBox.clearfix');

    ctx.state.data = {
        title: `鸟哥笔记-分类-${cat_name}`,
        link: `http://www.niaogebiji.com/cat/${cat_id}`,
        item: await Promise.all(
            articles.toArray().map(async (element) => {
                const article_div = findAttributeFromNodes(element.children, 'href');
                const link_attach = article_div.attribs.href;
                const article_link = `http://www.niaogebiji.com${link_attach}`;
                return {
                    title: findMatch(article_div.children, 'class', 'articleTitle elp', true).children[0].data,
                    category: cat_name,
                    description: await ctx.cache.tryGet(link_attach, async () => {
                        // get article
                        const article_response = await got(article_link);
                        return cheerio.load(article_response.data)('div.mobileHide.pc_content').html();
                    }),
                    link: article_link,
                    pubDate: parseInt(element.attribs['data-timepoint'] + '000'),
                };
            })
        ),
    };
};
