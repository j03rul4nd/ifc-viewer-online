/*
 * Bimo IFC Viewer — front end. Bundled with the plugin; loaded only on pages
 * that contain a viewer or a guided step. It talks to the viewer iframe with
 * postMessage only, and accepts messages from www.ifcvieweronline.eu only.
 *
 * - Click to load: the poster button swaps itself for the viewer iframe.
 * - Events: every viewer event is re-dispatched on the viewer's wrapper as a
 *   DOM CustomEvent `bimo-ifc:<event>` (bubbles; the payload is in `detail`).
 * - window.BimoIFC.get(el) returns a small command API for one viewer.
 * - [ifc_step] / IFC Viewer Step blocks drive the nearest viewer while scrolled.
 */
( function () {
	'use strict';
	// Loaded twice (a theme or cache plugin concatenating scripts): keep the first.
	if ( window.BimoIFC ) return;

	var ORIGIN = 'https://www.ifcvieweronline.eu';
	var EMBED = '.ifcvo-embed';
	// What is pushed to window.dataLayer when the site owner opts in: no names, no IDs.
	var LAYER_EVENTS = { 'model-loaded': 1, 'validation-completed': 1, 'element-selected': 1, 'tour-started': 1, 'tour-ended': 1 };
	var states = [];
	var seq = 0;

	function stateOf( wrapper ) {
		for ( var i = 0; i < states.length; i++ ) {
			if ( states[ i ].wrapper === wrapper ) return states[ i ];
		}
		var s = { wrapper: wrapper, ready: false, loaded: false, queue: [], waiters: [] };
		states.push( s );
		return s;
	}

	function iframeOf( wrapper ) {
		return wrapper.querySelector( 'iframe' );
	}

	function post( s, message ) {
		var frame = iframeOf( s.wrapper );
		if ( frame && frame.contentWindow ) frame.contentWindow.postMessage( message, ORIGIN );
	}

	/** Commands wait for the viewer to be ready and its model in. */
	function send( s, message ) {
		if ( s.ready && s.loaded ) post( s, message );
		else s.queue.push( message );
	}

	function flush( s ) {
		if ( ! ( s.ready && s.loaded ) ) return;
		s.queue.splice( 0 ).forEach( function ( m ) { post( s, m ); } );
		s.waiters.splice( 0 ).forEach( function ( fn ) { fn(); } );
	}

	function launch( wrapper ) {
		var src = wrapper.getAttribute( 'data-ifcvo-src' );
		if ( ! src || iframeOf( wrapper ) ) return;
		var frame = document.createElement( 'iframe' );
		frame.src = src;
		frame.width = '100%';
		frame.height = wrapper.getAttribute( 'data-ifcvo-height' ) || '600';
		frame.title = wrapper.getAttribute( 'data-ifcvo-title' ) || '';
		frame.setAttribute( 'allow', 'fullscreen' );
		frame.style.cssText = 'border:0;border-radius:12px;max-width:100%;display:block';
		var poster = wrapper.querySelector( '.ifcvo-poster' );
		if ( poster ) wrapper.replaceChild( frame, poster );
		else wrapper.appendChild( frame );
		frame.focus();
	}

	function fillField( wrapper, d ) {
		var selector = wrapper.getAttribute( 'data-ifcvo-form-field' );
		if ( ! selector ) return;
		var input;
		try { input = document.querySelector( selector ); } catch ( e ) { return; }
		if ( ! input || ! ( 'value' in input ) ) return;
		var name = typeof d.name === 'string' ? d.name : '';
		var guid = typeof d.globalId === 'string' ? d.globalId : '';
		input.value = name && guid ? name + ' (' + guid + ')' : ( name || guid );
		// Form plugins (CF7, WPForms, Gravity Forms) listen for these.
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	}

	function pushLayer( wrapper, type, d ) {
		if ( wrapper.getAttribute( 'data-ifcvo-datalayer' ) !== '1' || ! LAYER_EVENTS[ type ] || ! Array.isArray( window.dataLayer ) ) return;
		var entry = { event: 'bimo_ifc_' + type.replace( /-/g, '_' ) };
		if ( type === 'element-selected' && typeof d.ifcType === 'string' ) entry.ifc_type = d.ifcType;
		if ( type === 'validation-completed' && typeof d.qualityScore === 'number' ) entry.score = d.qualityScore;
		window.dataLayer.push( entry );
	}

	window.addEventListener( 'message', function ( e ) {
		if ( e.origin !== ORIGIN ) return;
		var d = e.data;
		if ( ! d || d.source !== 'ifc-validator' || typeof d.type !== 'string' || ! /^[a-z-]{1,40}$/.test( d.type ) ) return;
		var wrappers = document.querySelectorAll( EMBED );
		for ( var i = 0; i < wrappers.length; i++ ) {
			var frame = iframeOf( wrappers[ i ] );
			if ( ! frame || frame.contentWindow !== e.source ) continue;
			var w = wrappers[ i ];
			var s = stateOf( w );
			if ( d.type === 'ready' ) s.ready = true;
			if ( d.type === 'model-loaded' ) s.loaded = true;
			flush( s );
			if ( d.type === 'element-selected' ) fillField( w, d );
			pushLayer( w, d.type, d );
			w.dispatchEvent( new CustomEvent( 'bimo-ifc:' + d.type, { bubbles: true, detail: d } ) );
			return;
		}
	} );

	function resolve( el ) {
		if ( typeof el === 'string' ) el = document.querySelector( el );
		if ( ! el || ! el.closest ) return null;
		return el.closest( EMBED ) || el.querySelector( EMBED );
	}

	/** The safe commands a page can give one viewer. */
	function api( wrapper ) {
		var s = stateOf( wrapper );
		function req( type, params ) {
			var m = { type: type, requestId: 'bimo-wp-' + ( ++seq ) };
			for ( var k in params ) {
				if ( Object.prototype.hasOwnProperty.call( params, k ) && params[ k ] !== undefined ) m[ k ] = params[ k ];
			}
			send( s, m );
		}
		return {
			element: wrapper,
			/** A GlobalId (22 characters) or an expressID. */
			select: function ( element, modelId ) {
				req( 'ifcviewer:select', typeof element === 'string' ? { globalId: element, modelId: modelId } : { expressId: Number( element ), modelId: modelId } );
			},
			/** An IFC class such as "IfcWall"; nothing to show everything. */
			isolate: function ( ifcType, options ) {
				req( 'ifcviewer:isolate', { ifcType: ifcType || undefined, frame: options && options.frame === false ? false : undefined } );
			},
			setView: function ( view ) { req( 'ifcviewer:view', { preset: String( view || 'iso' ) } ); },
			frame: function ( o ) {
				o = o || {};
				req( 'ifcviewer:view', { preset: o.view || 'iso', fill: o.fill !== undefined ? Number( o.fill ) : 0.85, azimuth: o.azimuth, elevation: o.elevation } );
			},
			startTour: function ( template, opts ) {
				req( 'ifcviewer:start-tour', { template: template || 'client-walkthrough', title: opts && opts.title } );
			},
			/** Load the viewer now, when it is behind a poster. */
			load: function () { launch( wrapper ); },
			on: function ( event, cb ) {
				var h = function ( e ) { cb( e.detail ); };
				wrapper.addEventListener( 'bimo-ifc:' + event, h );
				return function () { wrapper.removeEventListener( 'bimo-ifc:' + event, h ); };
			},
			whenReady: function () {
				return new Promise( function ( r ) { if ( s.ready && s.loaded ) r(); else s.waiters.push( r ); } );
			},
		};
	}

	window.BimoIFC = {
		get: function ( el ) {
			var w = resolve( el );
			return w ? api( w ) : null;
		},
	};

	function fullscreenButton( wrapper ) {
		if ( ! wrapper.requestFullscreen ) return;
		wrapper.style.position = wrapper.style.position || 'relative';
		var b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'ifcvo-fullscreen';
		b.setAttribute( 'aria-label', 'Full screen' );
		b.textContent = '⤢';
		b.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2;width:32px;height:32px;border:0;border-radius:6px;cursor:pointer;background:rgba(0,0,0,.55);color:#fff;font-size:16px;line-height:1';
		b.addEventListener( 'click', function () {
			if ( document.fullscreenElement ) document.exitFullscreen();
			else wrapper.requestFullscreen();
		} );
		wrapper.appendChild( b );
	}

	/** The viewer a step drives: the last one above it, else the first below. */
	function viewerFor( step, wrappers ) {
		var above = null;
		var below = null;
		for ( var i = 0; i < wrappers.length; i++ ) {
			// eslint-disable-next-line no-bitwise
			if ( step.compareDocumentPosition( wrappers[ i ] ) & Node.DOCUMENT_POSITION_PRECEDING ) above = wrappers[ i ];
			else if ( ! below ) below = wrappers[ i ];
		}
		return above || below;
	}

	function applyStep( step, wrapper ) {
		var v = api( wrapper );
		var d = step.dataset;
		var shot = d.view || d.azimuth || d.elevation || d.fill;
		// The step's own shot wins: isolating must not fly the camera too (as bindSteps).
		if ( d.isolate ) v.isolate( d.isolate === 'none' ? undefined : d.isolate, { frame: ! shot && ! d.select } );
		if ( d.select ) v.select( d.select );
		if ( shot ) {
			v.frame( {
				view: d.view || 'iso',
				fill: d.fill ? Number( d.fill ) : undefined,
				azimuth: d.azimuth ? Number( d.azimuth ) : undefined,
				elevation: d.elevation ? Number( d.elevation ) : undefined,
			} );
		}
	}

	function bindSteps( wrappers ) {
		var steps = document.querySelectorAll( '.ifcvo-step' );
		if ( ! steps.length || typeof IntersectionObserver === 'undefined' ) return;
		var current = new Map();
		var io = new IntersectionObserver( function ( entries ) {
			entries.forEach( function ( e ) {
				if ( ! e.isIntersecting ) return;
				var w = viewerFor( e.target, wrappers );
				if ( ! w || current.get( w ) === e.target ) return;
				current.set( w, e.target );
				applyStep( e.target, w );
			} );
		}, { rootMargin: '-45% 0px -45% 0px' } );
		steps.forEach( function ( s ) { io.observe( s ); } );
	}

	function init() {
		var wrappers = Array.prototype.slice.call( document.querySelectorAll( EMBED ) );
		wrappers.forEach( function ( w ) {
			stateOf( w );
			var button = w.querySelector( '.ifcvo-launch' );
			if ( button ) button.addEventListener( 'click', function () { launch( w ); } );
			if ( w.getAttribute( 'data-ifcvo-fullscreen' ) === '1' ) fullscreenButton( w );
		} );
		bindSteps( wrappers );
	}

	if ( document.readyState === 'loading' ) document.addEventListener( 'DOMContentLoaded', init );
	else init();
}() );
