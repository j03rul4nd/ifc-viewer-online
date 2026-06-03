import type enCommon from '../locales/en/common.json';
import type enToolbar from '../locales/en/toolbar.json';
import type enValidation from '../locales/en/validation.json';
import type enViewer from '../locales/en/viewer.json';
import type enSidebar from '../locales/en/sidebar.json';
import type enLanding from '../locales/en/landing.json';
import type enMeasurement from '../locales/en/measurement.json';
import type enEditor from '../locales/en/editor.json';
import type enErrors from '../locales/en/errors.json';
import type enToasts from '../locales/en/toasts.json';
import type enTree from '../locales/en/tree.json';
import type enBlog from '../locales/en/blog.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      toolbar: typeof enToolbar;
      validation: typeof enValidation;
      viewer: typeof enViewer;
      sidebar: typeof enSidebar;
      landing: typeof enLanding;
      measurement: typeof enMeasurement;
      editor: typeof enEditor;
      errors: typeof enErrors;
      toasts: typeof enToasts;
      tree: typeof enTree;
      blog: typeof enBlog;
    };
  }
}
