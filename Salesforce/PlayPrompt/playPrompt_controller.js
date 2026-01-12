/*
 * DISCLAIMER:
 * This sample code is provided for illustrative purposes and should not be treated as officially supported software by Five9.
 * By using this code, you understand that any customization, modification, or deployment is solely your responsibility if you 
 * choose not to engage with Five9's professional services team.
 * 
 * While this example demonstrates how a customization can be built, it is recommended that you consult with our professional 
 * services team for a fully supported and tailored solution to meet your specific needs.
 */

({
  f9libLoaded: function (cmp, evt, helper) {
    helper.init(cmp);
  },

  playPrompt: function (cmp, evt, helper) {
    helper.playPromptOnDemand(cmp);
  },

  doInit: function (cmp, evt, helper) {
    // Retrieve the record information using LDS
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});
