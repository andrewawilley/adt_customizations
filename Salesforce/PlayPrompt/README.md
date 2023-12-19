# Custom Lightning Component Implementation Guide

This custom lightning component allows for the automated playback of a skill prompt when a call is **connected and talking** to the agent.

Implementation of this component requires the following steps:

- Follow the steps [here](https://app.five9.com/dev/sdk/crm/latest/doc/tutorial-custsf.html) to create a custom lightning component in Salesforce 
  - The custom component name can be anything, but for the purposes of this guide, we will use **Five9_Customization**.  
  - Use the contents of the included **playPrompt_component.cmp** for the component definition and **playPrompt_controller.js** for the controller definition.


Change the name of the target prompt in the controller.js file on line 30:
```
    const promptNamePlayOnConnect = "Verbatim Case Sensitive Prompt Name from VCC here";
```

 # DISCLAIMER:
 This sample code is provided for illustrative purposes and should not be treated as officially supported software by Five9. By using this code, you understand that any customization, modification, or deployment is solely your responsibility if you  choose not to engage with Five9's professional services team.