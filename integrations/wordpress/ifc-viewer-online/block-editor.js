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
			var hasModel = a.attachment > 0 || a.model !== '';

			var picker = el( be.MediaUploadCheck, null,
				el( be.MediaUpload, {
					onSelect: function ( media ) { set( { attachment: media.id, model: '', name: media.filename || '' } ); },
					render: function ( o ) {
						return el( c.Button, { variant: 'secondary', onClick: o.open },
							a.attachment ? __( 'Replace IFC file', 'ifc-viewer-online' ) : __( 'Choose an IFC file from the Media Library', 'ifc-viewer-online' ) );
					},
				} )
			);

			var inspector = el( be.InspectorControls, null,
				el( c.PanelBody, { title: __( 'Model', 'ifc-viewer-online' ), initialOpen: true },
					picker,
					el( c.TextControl, {
						label: __( 'Or an https URL to an .ifc file', 'ifc-viewer-online' ),
						help: __( 'The other site must allow cross-origin requests (CORS).', 'ifc-viewer-online' ),
						value: a.model,
						onChange: function ( v ) { set( { model: v, attachment: 0 } ); },
					} ),
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
