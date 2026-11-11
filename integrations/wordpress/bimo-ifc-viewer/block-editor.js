/* Bimo IFC Viewer — block editor UI. Plain script on the wp.* globals, no build step. */
( function ( wp ) {
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var be = wp.blockEditor;
	var c = wp.components;
	var ServerSideRender = wp.serverSideRender;

	function option( value, label ) {
		return { value: value, label: label };
	}

	wp.blocks.registerBlockType( 'bimo-ifc-viewer/viewer', {
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
							ids.length ? __( 'Replace IFC files', 'bimo-ifc-viewer' ) : __( 'Choose IFC files from the Media Library', 'bimo-ifc-viewer' ) );
					},
				} ),
				ids.length > 1 ? el( 'p', null, __( 'These models load together as one federated scene.', 'bimo-ifc-viewer' ) ) : null
			);

			var inspector = el( be.InspectorControls, null,
				el( c.PanelBody, { title: __( 'Model', 'bimo-ifc-viewer' ), initialOpen: true },
					picker,
					el( c.TextControl, {
						label: __( 'Or https URLs to .ifc files (comma-separated)', 'bimo-ifc-viewer' ),
						help: __( 'The other site must allow cross-origin requests (CORS).', 'bimo-ifc-viewer' ),
						value: a.model,
						onChange: function ( v ) { set( { model: v } ); },
					} ),
					text( 'scan', __( 'Point clouds (https URLs, comma-separated)', 'bimo-ifc-viewer' ), __( 'LAS, LAZ, COPC, PLY, PCD… loaded with the model.', 'bimo-ifc-viewer' ) ),
					el( c.RangeControl, { label: __( 'Height (px)', 'bimo-ifc-viewer' ), min: 200, max: 1200, value: a.height, onChange: function ( v ) { set( { height: v } ); } } )
				),
				el( c.PanelBody, { title: __( 'Display', 'bimo-ifc-viewer' ), initialOpen: false },
					el( c.SelectControl, { label: __( 'Interface', 'bimo-ifc-viewer' ), value: a.ui, onChange: function ( v ) { set( { ui: v } ); },
						options: [ option( 'article', __( 'Article (clean, for posts)', 'bimo-ifc-viewer' ) ), option( 'minimal', __( 'Minimal', 'bimo-ifc-viewer' ) ), option( 'full', __( 'Full app', 'bimo-ifc-viewer' ) ), option( 'kiosk', __( 'Kiosk', 'bimo-ifc-viewer' ) ), option( 'client', __( 'Client presentation', 'bimo-ifc-viewer' ) ) ] } ),
					el( c.SelectControl, { label: __( 'Starting view', 'bimo-ifc-viewer' ), value: a.view, onChange: function ( v ) { set( { view: v } ); },
						options: [ 'iso', 'top', 'front', 'back', 'left', 'right' ].map( function ( v ) { return option( v, v ); } ) } ),
					el( c.ToggleControl, { label: __( 'Show the Health Score (validate on load)', 'bimo-ifc-viewer' ), checked: a.validate !== '0', onChange: function ( v ) { set( { validate: v ? '1' : '0' } ); } } ),
					el( c.ToggleControl, { label: __( 'Slow turntable until the visitor touches it', 'bimo-ifc-viewer' ), checked: a.turntable === '1', onChange: function ( v ) { set( { turntable: v ? '1' : '' } ); } } ),
					el( c.ToggleControl, { label: __( 'Mouse wheel scrolls the page (zoom with Ctrl)', 'bimo-ifc-viewer' ), checked: a.wheel === 'ctrl', onChange: function ( v ) { set( { wheel: v ? 'ctrl' : 'always' } ); } } ),
					el( c.TextControl, { label: __( 'Accent colour (hex)', 'bimo-ifc-viewer' ), value: a.accent, onChange: function ( v ) { set( { accent: v } ); } } ),
					el( c.TextControl, { label: __( 'Accessible title', 'bimo-ifc-viewer' ), value: a.title, onChange: function ( v ) { set( { title: v } ); } } )
				),
				el( c.PanelBody, { title: __( 'Site, sun and plans', 'bimo-ifc-viewer' ), initialOpen: false },
					select( 'map', __( 'Show the model on the map', 'bimo-ifc-viewer' ), [
						option( '', __( 'Off', 'bimo-ifc-viewer' ) ),
						option( '1', __( 'Map', 'bimo-ifc-viewer' ) ),
						option( 'terrain,buildings', __( 'Map with terrain and buildings', 'bimo-ifc-viewer' ) ),
					] ),
					select( 'look', __( 'Map look', 'bimo-ifc-viewer' ), [ '', 'daylight', 'maquette', 'golden', 'night', 'blueprint', 'dawn' ].map( function ( v ) { return option( v, v || __( 'Default', 'bimo-ifc-viewer' ) ); } ) ),
					text( 'solar', __( 'Sun study at site time', 'bimo-ifc-viewer' ), __( 'For example 06-21T19:30 (every year) or 2026-12-21T09:00. Needs a georeferenced model.', 'bimo-ifc-viewer' ) ),
					select( 'analysis', __( 'Solar and climate analysis', 'bimo-ifc-viewer' ), [
						option( '', __( 'Off', 'bimo-ifc-viewer' ) ),
						option( 'year', __( 'A year of sun', 'bimo-ifc-viewer' ) ),
						option( 'year:passive', __( 'Passive solar impact over a year', 'bimo-ifc-viewer' ) ),
						option( 'summer:sun', __( 'Sun hours at the summer solstice', 'bimo-ifc-viewer' ) ),
						option( 'winter:sun', __( 'Sun hours at the winter solstice', 'bimo-ifc-viewer' ) ),
					] ),
					text( 'site', __( 'Study the sun at another place (lat,lon)', 'bimo-ifc-viewer' ) ),
					el( c.ToggleControl, { label: __( 'Open with a plan cut of the model', 'bimo-ifc-viewer' ), checked: a.drawings === 'plan', onChange: function ( v ) { set( { drawings: v ? 'plan' : '' } ); } } )
				),
				el( c.PanelBody, { title: __( 'Digital twin', 'bimo-ifc-viewer' ), initialOpen: false },
					text( 'scene', __( 'Scene document (https URL)', 'bimo-ifc-viewer' ), __( 'A scene exported from IFC Viewer Online: models, data layers, live sensors, map and camera in one JSON. It brings its own models.', 'bimo-ifc-viewer' ) ),
					select( 'explore', __( 'Scene explorer', 'bimo-ifc-viewer' ), [
						option( '', __( 'Automatic', 'bimo-ifc-viewer' ) ),
						option( '1', __( 'On', 'bimo-ifc-viewer' ) ),
						option( '0', __( 'Off', 'bimo-ifc-viewer' ) ),
					] )
				)
			);

			var body = hasModel
				? el( ServerSideRender, { block: 'bimo-ifc-viewer/viewer', attributes: a } )
				: el( c.Placeholder, { icon: 'building', label: __( 'IFC Viewer', 'bimo-ifc-viewer' ), instructions: __( 'Embed an interactive 3D IFC model.', 'bimo-ifc-viewer' ) }, picker );

			return el( 'div', be.useBlockProps(), inspector, body );
		},
		save: function () { return null; },
	} );
} )( window.wp );
