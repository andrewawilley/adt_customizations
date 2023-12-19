# Custom Lightning Component Implementation Guide

This custom lightning component allows for the display of a modal pop-up in Salesforce when a user first connects to the Five9 agent application.

Implementation of this component requires the following steps:

- Follow the steps [here](https://app.five9.com/dev/sdk/crm/latest/doc/tutorial-custsf.html) to create a custom lightning component in Salesforce 
  - The custom component name can be anything, but for the purposes of this guide, we will use **Five9_Customization**.  
  - Use the contents of the included **Five9_Customization.component.cmp** for the component definition and **Five9_Customization.controller.js** for the controller definition.

- Add a second custom lightning component to Salesforce that will be used to display the modal pop-up.  
  - The custom component name must be **ComplianceAcknowledgmentModal**.
  - Use the contents of the included ComplianceAcknowledgmentModal.component.cmp for the component definition, **update the compliance language that will be displayed**
  - This component does not need to be added as a utility item. 

The custom component uses the "Metadata Obtained" event from the Five9 agent adapter as the trigger to show the compliance language.  The custom component will only be displayed once per session.  If the user closes the modal pop-up, it will not be displayed again until the next time the user logs into Five9.  If the user logs out of Five9 and logs back in, the modal pop-up will be displayed again.

 # DISCLAIMER:
 This sample code is provided for illustrative purposes and should not be treated as officially supported software by Five9. By using this code, you understand that any customization, modification, or deployment is solely your responsibility if you  choose not to engage with Five9's professional services team.