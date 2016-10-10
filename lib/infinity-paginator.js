/*jshint bitwise:true, curly:true, eqeqeq:true, forin:true, noarg:true,
noempty:true, nonew:true, undef:true, strict:true, browser:true, devel:true,
    esversion: 6, -W097 */
/*global console: true, require */

'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('core-js/es5');
var $ = require('jquery');
var debounce = require('debounce');

/**
 * Default plugin options.
 * @type {Object}
 */
var defaults = {
    // Object can push state to history (otherwise use navigate event)
    selfNavigation: true,
    // Offset in pixels from the container edges to load pages
    edgePixels: 100,
    // Default data type for page content
    dataType: 'html',
    loadingPreventionCheck: true,
    pageClass: 'lister-page',
    preload: false,
    loadOnScroll: true
};

/**
 * @class InfinityPaginator
 * @classdesc Page loader with infinity scroll functionality.
 * @param {Object} options
 * @param {Element} options.container Block element whose scroll we are listening (e.g. window)
 * You can not detach this DOM element unless Paginator is not required anymore.
 * Element should exits all the time Paginator object exists. (all events bound to it)
 * @param {Element} options.element DOM element where Paginator lives
 * @param {Function} options.initialized
 * @param {Function} options.url
 * @param {Function} options.template
 * @param {Function} options.willLoad
 * @param {Function} options.loadingPrevented
 * @param {Function} options.didLoad
 * @param {Function} options.didRender
 * @param {Function} options.onStart
 * @param {Function} options.onEnd
 * @param {Function} options.scrollTo Methods that manages list container scroll
 * @param {Boolean} options.prefetch Required page pre-load (e.g. load 2 next pages instead requested one)
 * @param {Boolean} options.loadOnScroll Enable autoload pages on scroll
 */

var InfinityPaginator = exports.InfinityPaginator = function () {
    function InfinityPaginator(options) {
        _classCallCheck(this, InfinityPaginator);

        this._options = $.extend({}, defaults, options);

        this._state = {
            // Stores page span start
            firstPage: 1,
            // Stores page span end
            lastPage: 1,
            // Stores current navigated page
            currentPage: 1,
            // Stores number of pages for limit next page loading
            totalPages: 0,
            // Stores loaded pages
            pageCache: {},
            currentItem: null,
            // Stores DOM reference to insert previous page
            firstInsertionPoint: null,
            // Stores DOM reference to insert next page
            lastInsertionPoint: null,
            // Stores sent requests for page loading
            requests: [],

            // Starting migration from page to items.
            items: {}
        };

        this.lastScrollTop = 0;

        if (_typeof(this._options.edgePixels) === 'object') {
            this._options.edgePixelsTop = this._options.edgePixels.top;
            this._options.edgePixelsBottom = this._options.edgePixels.bottom;
        } else {
            this._options.edgePixelsTop = this._options.edgePixels;
            this._options.edgePixelsBottom = this._options.edgePixels;
        }

        if (_typeof(this._options.loadEdgePixels) === 'object') {
            this._options.loadEdgePixelsTop = this._options.loadEdgePixels.top;
            this._options.loadEdgePixelsBottom = this._options.loadEdgePixels.bottom;
        } else {
            this._options.loadEdgePixelsTop = this._options.loadEdgePixels;
            this._options.loadEdgePixelsBottom = this._options.loadEdgePixels;
        }

        this.bind(options.container, options);

        this._initState(options);

        if (this._options.preload) {
            this.preloadPages();
        }

        if (typeof this._options.initialized === 'function') {
            this._options.initialized.call(this);
            this.trigger('initialized');
        }

        return this;
    }

    /**
     * Default method used for technical scrolling (when we append pages
     * of need some scroll to hide top buttons...
     *
     * @param {boolean} options.force
     */


    _createClass(InfinityPaginator, [{
        key: '_scrollTo',
        value: function _scrollTo(position, duration, options) {
            if (this._options.scrollTo) {
                return this._options.scrollTo(position, duration, options);
            }

            var container = this._options.container === window ? document.body : this._options.container;
            $(container).animate({ scrollTop: position }, duration);
        }

        /**
         * Initiates state with default and configured options:
         *  # removes all cached pages from container
         *  # initialise Paginator params from element data attributes
         *  # reset some _state attrs
         * @param {object} options Same options as in constructor
         * @private
         */

    }, {
        key: '_initState',
        value: function _initState(options) {
            this._options = $.extend({}, this._options, options);

            // Remove all cached pages and from document body
            for (var pageNumber in this._state.pageCache) {
                if (this._state.pageCache.hasOwnProperty(pageNumber)) {
                    var page = this._state.pageCache[pageNumber];
                    $(this.container).find( // XXX: Not the best way to find old pages
                    this._options.itemSelector + '[data-page="' + pageNumber + '"]').remove();
                    delete this._state.pageCache[pageNumber];
                }
            }

            var data = $(this._options.holder).data();

            if (data) {
                this._state.path = data.path; //  XXX: What is it and where we use it?
                this._state.baseUrl = data.baseUrl; //  XXX: What is it and where we use it?
                this._state.urlTemplate = data.urlTemplate;
                this._state.currentPage = parseInt(data.page, 10);
                this._state.totalPages = parseInt(data.pages, 10);
            }

            this._state.firstPage = this._state.lastPage = this._state.currentPage;
            this._state.firstInsertionPoint = this._options.holder;
            this._state.lastInsertionPoint = this._options.holder;
            this._state.items[this._state.currentPage] = {
                id: this._state.currentPage,
                rendered: true
            };
            //var self = this;
            //// Delayed scrolling.
            //if (!options.noInitialScroll && self._state.currentPage > 1) {
            //    window.setTimeout(function() {
            //        self.scrollToPage(self._state.currentPage);
            //    }, 200);
            //}
        }

        /**
         * Reinitialize the plugin by setting the state.
         * @param {Object} options
         */

    }, {
        key: 'reinit',
        value: function reinit(options) {
            console.log('[Paginator]#reinit', Array.prototype.slice.apply(options.holder));
            this._initState(options);
            if (typeof this._options.initialized === 'function') {
                this._options.initialized.call(this);
                this.trigger('initialized');
            }
            // Chaining.
            return this;
        }

        /**
         * Main request routine. Configures and sends request.
         * @param {Object} options
         */

    }, {
        key: 'load',
        value: function load(options) {
            var req = $.ajax({
                dataType: options.dataType,
                url: options.url,
                data: options.data,
                success: options.success,
                error: options.error
            });
            this._state.requests.push(req);
            // Chaining.
            return this;
        }

        /**
         * Aborts page loading.
         * @return {InfinityPaginator}
         */

    }, {
        key: 'cancel',
        value: function cancel() {
            while (this._state.requests.length) {
                var req = this._state.requests.pop();
                req.abort();
            }
            // Chaining.
            return this;
        }

        /**
         * Configures page load request, sends it and render response,
         * if options.render is set to true.
         * @param {Object} options All options except `page` required for `didLoadPage`, `didFailLoadPage`
         * @param {Boolean} options.render Flag; if true, received content will be rendered
         * @param {Integer} options.page Page number to load (starts count from 1)
         * @param {String} options.dataType
         * @param {Function} options.didLoad Handler for XHR onSuccess
         */

    }, {
        key: 'loadPage',
        value: function loadPage(options) {
            if (this._state.pageCache[options.page]) {
                return;
            }
            console.log('[Paginator]: loadPage( options=', options, ')');
            var items = this._state.items;
            var item;
            if (items.hasOwnProperty(options.page)) {
                item = this._state.items[options.page];
            } else {
                item = this._state.items[options.page] = {};
            }
            if (item.loading) {
                return;
            }
            var data = {
                page: options.page,
                direction: options.direction
            };
            var url = this._options.url;
            if (typeof this._options.url === 'function') {
                url = this._options.url.call(this, data);
            }
            options.url = url;
            var self = this;
            if (typeof this._options.willLoad === 'function') {
                this._options.willLoad.call(this, options);
            }

            this._state.items[options.page] = { loading: true };

            this.load({
                url: url,
                dataType: this._options.dataType,
                success: function success(res) {
                    self.didLoadPage(options, res);
                },
                error: function error(res) {
                    self.didFailLoadPage(options, res);
                }
            });
            // Chaining.
            return this;
        }

        /**
         * Handles page load failure.
         * @param {Object} options
         * @param {Object} res
         */

    }, {
        key: 'didFailLoadPage',
        value: function didFailLoadPage(options, res) {
            var item = this._state.items[options.page];
            $.extend(item, {
                loading: false,
                loaded: false
            });
            if (typeof this._options.didFailLoad === 'function') {
                this._options.didFailLoad(options, res);
            }
            this.trigger('error', options, res);
        }

        /**
         * Handles page load success.
         * @param {Object} options
         * @param {Object} res
         */

    }, {
        key: 'didLoadPage',
        value: function didLoadPage(options, res) {
            if (typeof this._options.didLoad === 'function') {
                this._options.didLoad.call(this, options); // XXX: Why don't we pass result ???
            }
            this.trigger('load');
            if (!this._state.pageCache[options.page]) {
                if (options.direction === 'next') {
                    this._state.lastPage = options.page;
                }
                if (options.direction === 'prev') {
                    this._state.firstPage = options.page;
                }
                this._state.pageCache[options.page] = { url: options.url, data: res };
                var item = this._state.items[options.page];
                $.extend(item, {
                    id: options.page,
                    url: options.url,
                    data: res,
                    loading: false,
                    loaded: true
                });

                if (options.render) {
                    this.renderPage(options, res);
                }
            }
        }
    }, {
        key: 'withSavedScroll',
        value: function withSavedScroll(action) {
            // works in consderation the bottom part is not changed
            var $container = $(this._options.container === window ? document.body : this._options.container);
            var scrollTop = $container.scrollTop();
            var prevHeight = Math.max($container.prop('scrollHeight'), $container.outerHeight());

            action();

            // Eliminating top scroll increase.
            var _yDelta = Math.max($container.prop('scrollHeight'), $container.outerHeight()) - prevHeight;
            this._scrollTo((_yDelta < 0 ? '-=' : '+=') + String(Math.abs(_yDelta)), 0, { force: true });
        }

        /**
         * Constructs DOM for the page and places it appropriately.
         * @param {Object} options
         * @param {Object} res
         */

    }, {
        key: 'renderPage',
        value: function renderPage(options, res) {
            var $container = $(this._options.container === window ? document.body : this._options.container);
            var $html;
            if (this._state.items[options.page].rendered) {
                return;
            }
            console.log('[Paginator]: Rendering', options.direction);
            options.response = res;
            if (this._options.template) {
                $html = $(this._options.template(res, options));
            } else {
                options.parsedResponse = $.parseHTML(res);
                $html = $(options.parsedResponse).find(this._options.itemSelector);
                $html = '<div class="' + this._options.pageClass + '"' + ' id="page-' + options.page + '" data-page="' + options.page + '">' + $html.html() + '</div>';
                $html = $($html);
            }

            if (typeof this._options.willRender === 'function') {
                this._options.willRender.call(this, options, $html);
            }
            this.trigger('willRender', options, $html);
            if (options.direction === 'next') {
                $(this._state.lastInsertionPoint).after($html);
                this._state.lastInsertionPoint = $html;
            } else {
                this.withSavedScroll(function () {
                    $(this._state.firstInsertionPoint).before($html);
                    this._state.firstInsertionPoint = $html;
                }.bind(this));
            }
            this._state.items[options.page].rendered = true;
            if (typeof this._options.didRender === 'function') {
                this._options.didRender.call(this, options, $html);
            }
            this.trigger('render', options, $html);
            // Chaining.
            return this;
        }

        /**
         * Loads next page.
         * @param {Boolean} options.prefetch Flag; if true, two next pages will be loaded
         */

    }, {
        key: 'nextPage',
        value: function nextPage(options) {
            var page = this._state.currentPage + 1;
            if (page <= this._state.totalPages) {
                if (this._state.pageCache[page]) {
                    this.renderPage({
                        page: page,
                        direction: 'next'
                    }, this._state.pageCache[page].data);
                } else {
                    this.loadPage({
                        page: page,
                        direction: 'next',
                        render: true
                    });
                    if (options && options.prefetch && page + 1 < this._state.totalPages) {
                        this.loadPage({
                            page: page + 1,
                            direction: 'next'
                        });
                    }
                }
            } else {
                if (typeof this._options.onEnd === 'function') {
                    this._options.onEnd.call(this);
                }
            }
            // Chaining.
            return this;
        }

        /**
         * Loads previous page.
         * @param {Boolean} options.prefetch Flag; if true, two previous pages will be loaded
         */

    }, {
        key: 'prevPage',
        value: function prevPage(options) {
            var page = this._state.currentPage - 1;
            if (page > 0) {
                if (this._state.pageCache[page]) {
                    this.renderPage({
                        page: page,
                        direction: 'prev'
                    }, this._state.pageCache[page].data);
                } else {
                    this.loadPage({
                        page: page,
                        direction: 'prev',
                        render: true
                    });
                    if (options && options.prefetch && page > 1) {
                        this.loadPage({
                            page: page - 1,
                            direction: 'prev'
                        });
                    }
                }
            } else {
                if (typeof this._options.onStart === 'function') {
                    this._options.onStart.call(this);
                }
            }
            // Chaining.
            return this;
        }

        /**
         * Resolves current scrolling state.
         * @param {Object} options
         * @return {*}
         */

    }, {
        key: 'nearTheEdge',
        value: function nearTheEdge(options) {
            var toTop, toRight, toBottom, toLeft;

            var container = options.container;
            var resolvedContainer = container === window ? document.body : container;

            var scrollTop = $(container).scrollTop();
            var scrollLeft = $(container).scrollLeft();
            var scrollWidth = $(resolvedContainer).prop('scrollWidth');
            var scrollHeight = $(resolvedContainer).prop('scrollHeight');
            var width = $(options.window ? window : container).width();
            var height = $(options.window ? window : container).height();
            var shouldLoad = true;
            toTop = 0 + scrollTop;
            toRight = 0 + scrollWidth - scrollLeft - width;
            toBottom = 0 + scrollHeight - scrollTop - height;
            toLeft = 0 + $(container).scrollLeft();

            if (this._options.loadingPreventionCheck) {
                // XXX wtf is this? At least, describe! String by string!
                if (this._options.top && toTop - this._options.edgePixelsTop < 0) {
                    var top = this._options.top;
                    if (typeof this._options.top === 'function') {
                        top = this._options.top();
                    }
                    shouldLoad = top <= toTop;

                    //console.log('[Paginator] prevented loading top');
                }

                if (this._options.bottom && toBottom - this._options.edgePixelsBottom < 0) {
                    var bottom = this._options.bottom;
                    if (typeof this._options.bottom === 'function') {
                        bottom = this._options.bottom();
                    }
                    shouldLoad = bottom <= toBottom;

                    //console.log('[Paginator] prevented loading bottom');
                }
            }

            if (!shouldLoad) {
                if (typeof this._options.loadingPrevented === 'function') {
                    this.cancel();
                    this._options.loadingPrevented.call(this);
                }
                var nullObject = { top: false, right: false,
                    bottom: false, left: false };
                return { load: nullObject, render: nullObject };
            }

            if (options.full) {
                // XXX always true
                if (options.load) {
                    // XXX always true
                    return {
                        load: {
                            top: toTop - this._options.loadEdgePixelsTop < 0,
                            right: toRight - this._options.loadEdgePixels < 0,
                            bottom: toBottom - this._options.loadEdgePixelsBottom < 0,
                            left: toLeft - this._options.loadEdgePixels < 0
                        },
                        render: {
                            top: toTop - this._options.edgePixelsTop < 0,
                            right: toRight - this._options.edgePixels < 0,
                            bottom: toBottom - this._options.edgePixelsBottom < 0,
                            left: toLeft - this._options.edgePixels < 0
                        }
                    };
                } else {
                    return {
                        top: toTop - this._options.edgePixelsTop < 0,
                        right: toRight - this._options.edgePixels < 0,
                        bottom: toBottom - this._options.edgePixelsBottom < 0,
                        left: toLeft - this._options.edgePixels < 0
                    };
                }
            } else {
                return toTop - this._options.edgePixelsTop < 0 || toBottom - this._options.edgePixelsBottom < 0;
            }
        }

        /**
         * Handles URL navigation.
         * @param {Object} itemData
         */

    }, {
        key: 'navigate',
        value: function navigate(itemData) {
            if (this._options.shouldNavigate && !this._options.shouldNavigate.call(this, { page: itemData.index, navigated: true })) {
                return;
            }
            var url = this._options.url.call(this, { page: itemData.index, navigated: true });
            if (!url) {
                console.warn('url is empty, check base-url and url-template options!');
            }
            if (this._options.selfNavigation && window.location.href !== url && 'replaceState' in window.history) {
                window.history.replaceState({}, '', url);
            }
            console.log('[Paginator]: Navigated', url);
            this.trigger('navigate', url);
            // Chaining.
            return this;
        }
    }, {
        key: 'pause',
        value: function pause() {
            this._state.isPaused = true;
        }
    }, {
        key: 'resume',
        value: function resume() {
            this._state.isPaused = false;
        }

        /**
         * Scrolls the container to specified page.
         * @param {Number} pageNumber
         * @param {Boolean} animated
         * @return {InfinityPaginator}
         */

    }, {
        key: 'scrollToPage',
        value: function scrollToPage(pageNumber, animated) {
            if (typeof animated === 'undefined') {
                animated = true;
            }
            var pageElement = $('.' + this._options.pageClass + '[data-page="' + pageNumber + '"]');
            if (pageElement && pageElement.length) {
                var $pageElement = $(pageElement);
                // Recalculating offset, because top line is changing position.
                var position = $pageElement.offset().top - this._options.topOffset();
                this._scrollTo(position, 0 /*animated ? 500 : 0*/);
            }
            // Chaining.
            return this;
        }

        /**
         * Pre-loads pages (+-1) and append them to DOM.
         */

    }, {
        key: 'preloadPages',
        value: function preloadPages() {
            this.prevPage();
            this.nextPage();
            // Chaining.
            return this;
        }

        /**
         * Framework agnostic event listener.
         * @param {jQuery} element
         * @param {String} type
         * @param {Function} handler
         */

    }, {
        key: 'addEvent',
        value: function addEvent(element, type, handler) {
            $(element).bind(type, handler);
            // Chaining.
            return this;
        }

        /**
         * Framework agnostic event listener remover.
         * @param {jQuery} element
         * @param {String} type
         * @param {Function} handler
         */

    }, {
        key: 'removeEvent',
        value: function removeEvent(element, type, handler) {
            $(element).unbind(type, handler);
            // Chaining.
            return this;
        }
    }, {
        key: 'onScroll',
        value: function onScroll(e) {
            var self = this;

            if (self._state.isPaused) {
                return;
            }

            var handleScroll = true;
            if (typeof this._options.handleScroll === 'function') {
                handleScroll = this._options.handleScroll();
            } else if (this._options.handleScroll !== undefined) {
                handleScroll = !!this.options.handleScroll;
            }

            if (!handleScroll) {
                return;
            }

            if (!self._options.holder.closest('body').length) {
                this.unbind();
                return;
            }

            var scrollTop = $(self.container).scrollTop();
            var scrollDirection = this.lastScrollTop > scrollTop ? 'up' : 'down';
            this.lastScrollTop = scrollTop;

            // The size of fixed header that is not moved when user scrolls
            var topOffset = self._options.topOffset() || 0;

            // TODO Optimize.
            var navigated = false;
            var threshold = 50;
            scrollTop = $(self._options.container).scrollTop() + topOffset;
            var items = $(self._options.itemSelector, self._options.container === window ? document.body : self._options.container);
            var position, itemHeight, page;

            for (var i = 0; i < items.length; i++) {
                var $item = $(items[i]);
                position = $item.position().top - scrollTop;
                itemHeight = $item.outerHeight();
                page = $item.data('page');
                if (threshold - Math.abs(position) > 0 || position + itemHeight > 0) {
                    if (self._state.currentPage !== page) {
                        self._state.currentPage = page;
                        self.navigate({ index: page });
                        navigated = true;
                    }
                    break;
                }
            }

            if (!navigated && position + itemHeight < 0) {
                if (self._state.currentPage !== page) {
                    self._state.currentPage = page;
                    self.navigate({ index: page });
                }
            }

            if (self._options.loadOnScroll) {
                var near = self.nearTheEdge({
                    container: self._options.container,
                    full: true,
                    load: true,
                    window: self._options.container === window
                });

                var load = near.load;
                var render = near.render;

                if (load.top && scrollDirection === 'up') {
                    window.setTimeout(function () {
                        self.prevPage();
                    }, 100);
                } else if (load.bottom && scrollDirection === 'down') {
                    window.setTimeout(function () {
                        self.nextPage();
                    }, 100);
                }

                if (render.top && scrollDirection === 'up') {
                    window.setTimeout(function () {
                        self.prevPage({ prefetch: true });
                    }, 100);
                } else if (render.bottom && scrollDirection === 'down') {
                    window.setTimeout(function () {
                        self.nextPage({ prefetch: true });
                    }, 100);
                }
            }
        }

        /**
         * Adds event listeners like scroll, keyboard and mouse move.
         * @param {Element|jQuery} container
         * @param {Object} options
         */

    }, {
        key: 'bind',
        value: function bind(container, options) {
            // Adds keyboard event listener to handle space, page up, etc.
            this.addEvent(window, 'keydown', function (e) {
                if (container && container.tagName && !container.closest('body').length || !this._options.holder || !this._options.holder.length) {
                    this.unbind();
                    return;
                }
                if (this._state.isPaused) {
                    return;
                }

                if (e.keyCode === 34 /**/ || e.keyCode === 32 /*Space*/ || e.keyCode === 9 /**/ || e.keyCode === 35 /**/ || e.keyCode === 40 /*Down*/) {
                        this.nextPage();
                    }
                if (e.shiftKey && e.keyCode === 32 || /*Shift+Space*/e.keyCode === 38 /*Up*/) {
                        this.prevPage();
                    }
            }.bind(this));

            this.addEvent(container, 'scroll', debounce(this.onScroll.bind(this), 75));
            // Chaining.
            return this;
        }

        /**
         * Removes event listeners.
         * @param {Element|jQuery} container
         */

    }, {
        key: 'unbind',
        value: function unbind(container) {
            this.removeEvent(container, 'scroll');
            this.removeEvent(window, 'mousemove');
            this.removeEvent(window, 'keydown');
            // Chaining.
            return this;
        }

        /**
         * Event triggering support.
         * @param {String} eventName
         * param {Array} extraParams List of extra params passed to handler
         */

    }, {
        key: 'trigger',
        value: function trigger(eventName /*, extraParams*/) {
            var args = Array.prototype.slice.call(arguments, 1);
            // TODO: Add mootools support
            $(this).trigger(eventName + '.paginator', args);
            // Chaining.
            return this;
        }

        /**
         * Event binding support.
         * @param {String} eventName
         * @param {Function} func
         */

    }, {
        key: 'on',
        value: function on(eventName, func) {
            $(this).on(eventName + '.paginator', func);
            // Chaining.
            return this;
        }

        /**
         * Event unbinding support.
         * @param {String} eventName
         * @param {Function} func
         */

    }, {
        key: 'off',
        value: function off(eventName, func) {
            $(this).off(eventName + '.paginator', func);
            // Chaining.
            return this;
        }
    }]);

    return InfinityPaginator;
}();