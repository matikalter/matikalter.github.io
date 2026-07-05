/* ======================================================================
   VIDEO SYNC — shared plumbing for keeping inline embeds and the enlarge
   lightbox in lock-step (time position, mute state, volume, play-state).

   - Vimeo:   official Player API (player.vimeo.com/api/player.js).
   - YouTube: the widget postMessage protocol directly (no SDK needed) —
     requires enablejsapi=1 on the iframe src; portfolio.js adds it when
     rendering YT embeds. After a "listening" handshake the widget streams
     `infoDelivery` messages (currentTime / muted / volume / playerState)
     which we cache per-iframe, so state reads are synchronous.

   IMPORTANT: a player wrapper is only valid for an iframe ELEMENT whose
   src has never changed. To restart or swap an embed, replace the element
   (portfolio.js does this for the lightbox and the about reel).
   ====================================================================== */
(function () {
  'use strict';

  /* rewrite-or-add one query param on an embed URL, preserving any #hash */
  function setUrlParam(url, key, val) {
    var hashIdx = url.indexOf('#');
    var hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
    var base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    var re = new RegExp('([?&])' + key + '=[^&]*');
    if (re.test(base)) base = base.replace(re, '$1' + key + '=' + val);
    else base += (base.indexOf('?') >= 0 ? '&' : '?') + key + '=' + val;
    return base + hash;
  }

  function isVimeoSrc(src)   { return /player\.vimeo\.com/.test(src || ''); }
  function isYouTubeSrc(src) { return /youtube(-nocookie)?\.com\/embed\//.test(src || ''); }

  /* ── Vimeo: one Player wrapper per iframe element ── */
  var vimeoPlayers = new WeakMap();
  function vimeoPlayerFor(iframe) {
    if (!iframe || !window.Vimeo || !window.Vimeo.Player) return null;
    if (vimeoPlayers.has(iframe)) return vimeoPlayers.get(iframe);
    var p;
    try { p = new window.Vimeo.Player(iframe); } catch (e) { return null; }
    vimeoPlayers.set(iframe, p);
    return p;
  }

  /* ── YouTube: handshake + per-iframe state cache ── */
  var ytSeq = 0;
  var ytData = new WeakMap();

  window.addEventListener('message', function (e) {
    if (!/^https?:\/\/([\w-]+\.)*youtube(-nocookie)?\.com$/.test(e.origin)) return;
    var d;
    try { d = JSON.parse(e.data); } catch (err) { return; }
    if (!d || !d.info) return;
    /* find which of our iframes this widget lives in */
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var rec = ytData.get(frames[i]) || {};
        if (typeof d.info.currentTime  === 'number')  rec.t      = d.info.currentTime;
        if (typeof d.info.muted       === 'boolean')  rec.muted  = d.info.muted;
        if (typeof d.info.volume      === 'number')   rec.volume = d.info.volume;
        if (typeof d.info.playerState === 'number')   rec.state  = d.info.playerState;
        ytData.set(frames[i], rec);
        return;
      }
    }
  });

  /* start the infoDelivery stream for one YT iframe (idempotent). The widget
     ignores the handshake until it's booted, so we retry for a few seconds. */
  function ytListen(iframe) {
    if (!iframe || iframe.__ytListening) return;
    iframe.__ytListening = true;
    var msg = JSON.stringify({ event: 'listening', id: 'p' + (++ytSeq), channel: 'widget' });
    function send() {
      try { iframe.contentWindow.postMessage(msg, '*'); } catch (e) {}
    }
    iframe.addEventListener('load', function () { setTimeout(send, 250); setTimeout(send, 1000); });
    var tries = 0;
    var iv = setInterval(function () {
      send();
      if (++tries > 11 || !iframe.isConnected) clearInterval(iv);
    }, 700);
  }

  /* fire-and-forget widget command, e.g. ytCmd(f,'seekTo',[12,true]) */
  function ytCmd(iframe, func, args) {
    if (!iframe) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: func, args: args || [] }), '*');
    } catch (e) {}
  }

  /* latest cached state for a YT iframe: {t, muted, volume, state} (may be {}) */
  function ytInfo(iframe) { return (iframe && ytData.get(iframe)) || {}; }

  window.setUrlParam    = setUrlParam;
  window.isVimeoSrc     = isVimeoSrc;
  window.isYouTubeSrc   = isYouTubeSrc;
  window.vimeoPlayerFor = vimeoPlayerFor;
  window.ytListen       = ytListen;
  window.ytCmd          = ytCmd;
  window.ytInfo         = ytInfo;
})();
