/* IFC Viewer Online — block editor UI. Plain script on the wp.* globals, no build step. */
( function ( wp ) {
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var be = wp.blockEditor;
	var c = wp.components;
	var ServerSideRender = wp.serverSideRender;

	function option( value, label ) {
		return { value: value, label: label };
	}

	wp.blocks.registerBlockType( 'ifc-viewer-online/viewer', {
		edit: function ( props ) {
			var a = props.attributes;
			var set = props.setAttributes;
			// One id (blocks saved by 1.0) or several, comma-separated.
			var ids = String( a.attachment || '' ).split( ',' ).map( Number ).filter( Boolean );
			var hasModel = ids.length > 0 || a.model !== '' || a.scene !== '';
			function text( key, label, help ) {
				return el( c.TextControl, { label: label, help: help, value: a[ key ], onChange: function ( v ) { var o = {}; o[ key ] = v; set( o ); } } );
			}
			function select( key, label, options ) {
				return el( c.SelectControl, { label: label, value: a[ key ], options: options, onChange: function ( v ) { var o = {}; o[ key ] = v; set( o ); } } );
			}

			var picker = el( be.MediaUploadCheck, null,
				el( be.MediaUpload, {
					multiple: true,
					value: ids,
					onSelect: function ( media ) {
						media = [].concat( media );
						set( { attachment: media.map( function ( m ) { return m.id; } ).join( ',' ), name: '' } );
					},
					render: function ( o ) {
						return el( c.Button, { variant: 'secondary', onClick: o.open },
							ids.length ? __( 'Replace IFC files', 'ifc-viewer-online' ) : __( 'Choose IFC files from the Media Library', 'ifc-viewer-online' ) );
					},
				} ),
				ids.length > 1 ? el( 'p', null, __( 'These models load together as one federated scene.', 'ifc-viewer-online' ) ) : null
			);

			var inspector = el( be.InspectorControls, null,
				el( c.PanelBody, { title: __( 'Model', 'ifc-viewer-online' ), initialOpen: true },
					picker,
					el( c.TextControl, {
						label: __( 'Or https URLs to .ifc files (comma-separated)', 'ifc-viewer-online' ),
						help: __( 'The other site must allow cross-origin requests (CORS).', 'ifc-viewer-online' ),
						value: a.model,
						onChange: function ( v ) { set( { model: v } ); },
					} ),
					text( 'scan', __( 'Point clouds (https URLs, comma-separated)', 'ifc-viewer-online' ), __( 'LAS, LAZ, COPC, PLY, PCD… loaded with the model.', 'ifc-viewer-online' ) ),
					el( c.RangeControl, { label: __( 'Height (px)', 'ifc-viewer-online' ), min: 200, max: 1200, value: a.height, onChange: function ( v ) { set( { height: v } ); } } )
				),
				el( c.PanelBody, { title: __( 'Display', 'ifc-viewer-online' ), initialOpen: false },
					el( c.SelectControl, { label: __( 'Interface', 'ifc-viewer-online' ), value: a.ui, onChange: function ( v ) { set( { ui: v } ); },
						options: [ option( 'article', __( 'Article (clean, for posts)', 'ifc-viewer-online' ) ), option( 'minimal', __( 'Minimal', 'ifc-viewer-online' ) ), option( 'full', __( 'Full app', 'ifc-viewer-online' ) ), option( 'kiosk', __( 'Kiosk', 'ifc-viewer-online' ) ), option( 'client', __( 'Client presentation', 'ifc-viewer-online' ) ) ] } ),
					el( c.SelectControl, { label: __( 'Starting view', 'ifc-viewer-online' ), value: a.view, onChange: function ( v ) { set( { view: v } ); },
						options: [ 'iso', 'top', 'front', 'back', 'left', 'right' ].map( function ( v ) { return option( v, v ); } ) } ),
					el( c.ToggleControl, { label: __( 'Show the Health Score (validate on load)', 'ifc-viewer-online' ), checked: a.validate !== '0', onChange: function ( v ) { set( { validate: v ? '1' : '0' } ); } } ),
					el( c.ToggleControl, { label: __( 'Slow turntable until the visitor touches it', 'ifc-viewer-online' ), checked: a.turntable === '1', onChange: function ( v ) { set( { turntable: v ? '1' : '' } ); } } ),
					el( c.ToggleControl, { label: __( 'Mouse wheel scrolls the page (zoom with Ctrl)', 'ifc-viewer-online' ), checked: a.wheel === 'ctrl', onChange: function ( v ) { set( { wheel: v ? 'ctrl' : 'always' } ); } } ),
					el( c.TextControl, { label: __( 'Accent colour (hex)', 'ifc-viewer-online' ), value: a.accent, onChange: function ( v ) { set( { accent: v } ); } } ),
					el( c.TextControl, { label: __( 'Accessible title', 'ifc-viewer-online' ), value: a.title, onChange: function ( v ) { set( { title: v } ); } } )
				),
				el( c.PanelBody, { title: __( 'Site, sun and plans', 'ifc-viewer-online' ), initialOpen: false },
					select( 'map', __( 'Show the model on the map', 'ifc-viewer-online' ), [
						option( '', __( 'Off', 'ifc-viewer-online' ) ),
						option( '1', __( 'Map', 'ifc-viewer-online' ) ),
						option( 'terrain,buildings', __( 'Map with terrain and buildings', 'ifc-viewer-online' ) ),
					] ),
					select( 'look', __( 'Map look', 'ifc-viewer-online' ), [ '', 'daylight', 'maquette', 'golden', 'night', 'blueprint', 'dawn' ].map( function ( v ) { return option( v, v || __( 'Default', 'ifc-viewer-online' ) ); } ) ),
					text( 'solar', __( 'Sun study at site time', 'ifc-viewer-online' ), __( 'For example 06-21T19:30 (every year) or 2026-12-21T09:00. Needs a georeferenced model.', 'ifc-viewer-online' ) ),
					select( 'analysis', __( 'Solar and climate analysis', 'ifc-viewer-online' ), [
						option( '', __( 'Off', 'ifc-viewer-online' ) ),
						option( 'year', __( 'A year of sun', 'ifc-viewer-online' ) ),
						option( 'year:passive', __( 'Passive solar impact over a year', 'ifc-viewer-online' ) ),
						option( 'summer:sun', __( 'Sun hours at the summer solstice', 'ifc-viewer-online' ) ),
						option( 'winter:sun', __( 'Sun hours at the winter solstice', 'ifc-viewer-online' ) ),
					] ),
					text( 'site', __( 'Study the sun at another place (lat,lon)', 'ifc-viewer-online' ) ),
					el( c.ToggleControl, { label: __( 'Open with a plan cut of the model', 'ifc-viewer-online' ), checked: a.drawings === 'plan', onChange: function ( v ) { set( { drawings: v ? 'plan' : '' } ); } } )
				),
				el( c.PanelBody, { title: __( 'Digital twin', 'ifc-viewer-online' ), initialOpen: false },
					text( 'scene', __( 'Scene document (https URL)', 'ifc-viewer-online' ), __( 'A scene exported from IFC Viewer Online: models, data layers, live sensors, map and camera in one JSON. It brings its own models.', 'ifc-viewer-online' ) ),
					select( 'explore', __( 'Scene explorer', 'ifc-viewer-online' ), [
						option( '', __( 'Automatic', 'ifc-viewer-online' ) ),
						option( '1', __( 'On', 'ifc-viewer-online' ) ),
						option( '0', __( 'Off', 'ifc-viewer-online' ) ),
					] )
				)
			);

			var body = hasModel
				? el( ServerSideRender, { block: 'ifc-viewer-online/viewer', attributes: a } )
				: el( c.Placeholder, { icon: 'building', label: __( 'IFC Viewer', 'ifc-viewer-online' ), instructions: __( 'Embed an interactive 3D IFC model.', 'ifc-viewer-online' ) }, picker );

			return el( 'div', be.useBlockProps(), inspector, body );
		},
		save: function () { return null; },
	} );
} )( window.wp );
