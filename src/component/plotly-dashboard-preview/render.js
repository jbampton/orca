/* global Plotly:false */

const remote = require('../../util/remote')

/**
 * @param {object} info : info object
 *  - layoutType TODO
 *  - direction TODO
 *  - backgroundColor
 *  - panels
 * @param {object} opts : component options
 * @param {function} sendToMain
 *  - errorCode
 *  - result
 *    - imgData
 */

/*

props:
type: 'box', 'split'
boxType: 'plot', 'webpage', 'empty', 'text'
first
second

 */

function render (info, opts, sendToMain) {
  const winWidth = info.width
  const winHeight = info.height

  let win = remote.createBrowserWindow({
    width: winWidth,
    height: winHeight
  })

  const config = {
    mapboxAccessToken: opts.mapboxAccessToken || '',
    plotGlPixelRatio: opts.plotGlPixelRatio
  }

  const html = window.encodeURIComponent(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          width: ${winWidth};
          height: ${winHeight};
          background-color: ${info.backgroundColor};
          margin: 0; 
          padding: 0;
          overflow: hidden;
        }
        img {
          opacity: 0.5;
          display: block;
          padding: 0;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        div {
          display: flex;
          min-width: 0;
          min-height: 0;
          width: 100%;
          height: 100%;
          flex: 1 1 0%;
        }
      </style>
    </head>
    <body></body>
  </html>`)

  win.loadURL(`data:text/html,${html}`)

  const result = {}
  let errorCode = null

  const done = () => {
    win.close()

    if (errorCode) {
      result.msg = 'dashboard preview generation failed'
    }
    sendToMain(errorCode, result)
  }

  win.on('closed', () => {
    win = null
  })

  const contents = win.webContents

  const renderOnePlot = (p, idArray, imgWidth, imgHeight) => {
    return Plotly.toImage({
      data: p.data,
      layout: p.layout,
      config: config
    }, {
      format: 'png',
      width: imgWidth,
      height: imgHeight,
      imageDataOnly: false
    })
      .then(imgData => {
        contents.executeJavaScript(`new Promise((resolve, reject) => {
          const img = document.createElement('img')
          const root = document.getElementById('gd_${idArray.join('_')}')
          root.appendChild(img)
          img.onload = resolve
          img.onerror = reject
          img.src = '${imgData}'
          setTimeout(() => reject(new Error('too long to load image')), 5000)
        })`)
      })
  }

  const renderOneDiv = (idArray, verticalContainer) => {
    contents.executeJavaScript(`new Promise((resolve, reject) => {
          const root = ${idArray.length} ? document.getElementById('gd_${idArray.slice(0, -1).join('_')}') : document.body
          const div = document.createElement('div')
          div.setAttribute('id', 'gd_${idArray.join('_')}')
          div.style.background = 'rgb(${Math.round(255 * Math.random())}, ${Math.round(255 * Math.random())}, ${Math.round(255 * Math.random())})'
          if(${verticalContainer}) {
            div.style['flex-direction'] = 'column'
          }
          root.appendChild(div)
        })`)
  }

  contents.once('did-finish-load', () => {
    const promises = []

    const traversePanels = (p, path, width, height) => {
      const dir = p.direction
      renderOneDiv(path, p.type === 'split' && dir === 'vertical')
      switch (p.type) {
        case 'box': {
          promises.push(renderOnePlot(p.contents, path, width, height))
          break
        }
        case 'split': {
          const multiplier = 1 / p.panels.length
          const newWidth = dir === 'vertical' ? width : width * multiplier
          const newHeight = dir === 'horizontal' ? height : height * multiplier
          p.panels.forEach((panel, i) => {
            traversePanels(panel, path.concat([i]), newWidth, newHeight)
          })
          break
        }
        default: { }
      }
    }

    traversePanels(info.panels, [], winWidth, winHeight)

    Promise.all(promises)
      .then(() => {
        setTimeout(() => {
          contents.capturePage(img => {
            result.imgData = img.toPNG()
            done()
          })
        }, 100)
      })
      .catch(() => {
        errorCode = 525
        done()
      })
  })
}

module.exports = render
