// Public config. Both values are baked into the build. They aren't secrets:
// - GAPI_KEY is HTTP-referrer-restricted to this Netlify domain.
// - FOLDER_ID is just a Drive folder ID; the folder is set to "Anyone with the
//   link → Viewer" so the dashboard can read it anonymously.
export const GAPI_KEY = 'AIzaSyC_l4oOuggk-_1Ff2EKJZB6l_IDSaPzmMQ';
export const FOLDER_ID = '1MBGCoI4yTltZdRlnOHcpl9pg5ZaubluF';   // 02_OUT_CHINA
export const FILE_PREFIX = 'Reorder_China';
export const APP_TITLE = 'China Weekly Reorder';
export const SHEET_NAME = 'China Reorder';
