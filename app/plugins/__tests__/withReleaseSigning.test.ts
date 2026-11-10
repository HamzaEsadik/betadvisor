/** Part 17: release signing injected into the prebuild-generated android/app/build.gradle. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applySigning } = require('../withReleaseSigning') as {
  applySigning: (gradle: string) => string;
};

const GENERATED = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('withReleaseSigning', () => {
  const out = applySigning(GENERATED);

  it('adds a release signing config read from gradle properties', () => {
    expect(out).toContain("storeFile file(findProperty('BETADVISOR_UPLOAD_STORE_FILE'))");
    expect(out).toContain("keyPassword findProperty('BETADVISOR_UPLOAD_KEY_PASSWORD')");
  });

  it('signs release builds with it and leaves debug builds alone', () => {
    const [debugPart, releasePart] = out.split(/release \{\n\s+signingConfig/);
    expect(releasePart).toMatch(
      /^ findProperty\('BETADVISOR_UPLOAD_STORE_FILE'\) \? signingConfigs\.release/,
    );
    expect(debugPart).toContain('debug {\n            signingConfig signingConfigs.debug');
  });

  it('refuses to package a release without the upload key (no silent debug signing)', () => {
    expect(out).toContain('gradle.taskGraph.whenReady');
    expect(out).toContain('throw new GradleException');
  });

  it('is idempotent and fails loudly on an unexpected layout', () => {
    expect(applySigning(out)).toBe(out);
    expect(() => applySigning('android {}')).toThrow(/unexpected layout/);
  });
});
