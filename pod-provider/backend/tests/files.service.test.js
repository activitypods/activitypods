jest.mock('../config/config', () => ({
  SHAPE_REPOSITORY_URL: 'https://shapes.example'
}));

const filesService = require('../services/files');

describe('files service', () => {
  test('accepts image and video uploads for semapps:File resources', () => {
    expect(filesService.name).toBe('files');
    expect(filesService.settings.acceptedTypes).toContain('semapps:File');
    expect(filesService.settings.mimeTypes.accepted).toEqual(expect.arrayContaining(['image/*', 'video/*']));
  });
});
