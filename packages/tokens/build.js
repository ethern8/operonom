const StyleDictionary = require("style-dictionary");
const fs = require("fs");
const transformer = StyleDictionary.transform["attribute/cti"].transformer;

console.log("Build started...");
console.log("\n==============================================");

const propertiesToCTI = {
  space: { category: "size", type: "dimension" },
};

const CTITransform = {
  type: `attribute`,
  transformer: (prop) => {
    // Only do this custom functionality in the 'component' top-level namespace.
    if (prop.path[0] === "space") {
      console.log(prop.path[0], propertiesToCTI[prop.path[0]]);
      // When defining component tokens, the key of the token is the relevant CSS property
      // The key of the token is the last element in the path array
      return propertiesToCTI[prop.path[0]];
    } else {
      // Fallback to the original 'attribute/cti' transformer
      return transformer(prop);
    }
  },
};

StyleDictionary.registerFormat({
  name: "spritesheetFormat",
  formatter: function ({ dictionary, platform, options, file }) {
    const spritesheet = `<!--?xml version="1.0" encoding="utf-8"?-->
<svg xmlns='http://www.w3.org/2000.svg' xmlns:xlink="http://www.w3.org/1999/xlink">
    ${dictionary.allTokens.map((token) => token.value).join("\n\t")}
</svg>`;
    return spritesheet;
  },
});

StyleDictionary.registerFormat({
  name: "spritesheetFormatJs",
  formatter: function ({ dictionary, platform, options, file }) {
    const spritesheet = `export const spritesheet = \`<!--?xml version='1.0' encoding='utf-8'?-->
<svg xmlns='http://www.w3.org/2000.svg' xmlns:xlink='http://www.w3.org/1999/xlink'>
    ${dictionary.allTokens.map((token) => token.value).join("\n\t")}
</svg>\``;
    return spritesheet;
  },
});

StyleDictionary.registerTransform({
  name: "attribute/cti",
  type: "attribute",
  transformer: CTITransform.transformer,
});

StyleDictionary.registerTransform({
  name: "custom/svg", // notice: the name is an override of an existing predefined method (yes, you can do it)
  type: "value",
  matcher: function (token) {
    return (
      token.attributes.category === "asset" && token.attributes.type === "icon"
    );
  },
  transformer: function (token) {
    const svg = fs.readFileSync(token.value);
    const formatted = svg.toString().replace(/["']/g, "'");
    return formatted;
  },
});

StyleDictionary.registerTransform({
  name: "svg/symbol",
  type: "value",
  matcher: function (token) {
    return (
      token.attributes.category === "asset" && token.attributes.type === "icon"
    );
  },
  transformer: function (token) {
    // expect svg string
    return token.value
      .replace("<svg ", `<symbol id='${token.name}' `)
      .replace("</svg>", "</symbol>");
  },
});

// StyleDictionary.registerTransform({
//   name: "space/rem",
//   type: "value",
//   matcher: function (token) {
//     return token.attributes.category === "space";
//   },
//   transformer: function (token) {
//     const val = parseFloat(token.value);
//     if (isNaN(val)) throw `Invalid Number`;
//     return val + "rem";
//   },
// });

StyleDictionary.registerTransformGroup({
  name: "custom/icon",
  transforms: ["attribute/cti", "name/cti/kebab", "custom/svg"],
});

StyleDictionary.registerTransformGroup({
  name: "custom/sprite",
  transforms: ["attribute/cti", "name/cti/kebab", "custom/svg", "svg/symbol"],
});

StyleDictionary.registerTransformGroup({
  name: "custom/space",
  transforms: [
    "attribute/cti",
    "name/cti/kebab",
    "time/seconds",
    "content/icon",
    "size/rem",
    "color/css",
    "space/rem",
  ],
});

StyleDictionary.registerFilter({
  name: "isNotIcon",
  matcher: function (token) {
    return (
      token.attributes.category !== "asset" && token.attributes.type !== "icon"
    );
  },
});

StyleDictionary.registerFilter({
  name: "isSpaceToken",
  matcher: function (token) {
    return token.attributes.category === "space";
  },
});

// APPLY THE CONFIGURATION
// IMPORTANT: the registration of custom transforms
// needs to be done _before_ applying the configuration
const StyleDictionaryExtended = StyleDictionary.extend(
  __dirname + "/config.json"
);

// FINALLY, BUILD ALL THE PLATFORMS
StyleDictionaryExtended.buildAllPlatforms();

console.log("\n==============================================");
console.log("\nBuild completed!");
