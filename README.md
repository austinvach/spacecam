# Get Started with Widgets in 15 Minutes or Less
This sample helps you get up and running and will show you how all the pieces work together. 
## Import the Skill/Widget Sample
1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask/create-new-skill) to create a new skill (if you don’t already have a developer account, [you will need to create one](https://developer.amazon.com/en-US/docs/alexa/ask-overviews/create-developer-account.html)).
2. As part of the skill creation workflow you’ll need to do the following:
    - Enter a skill name (don’t worry about what you name it, you can change it later).
    - Set the primary locale to “English (US)”.
    - Choose "Other" as the experience type.
    - Keep default settings for model and hosting service (Model: Custom, Host: Alexa-hosted (Node.js)).
    - Choose an hosting region (doesn’t matter which).
3. Once you reach the “Templates” step, click the “Import skill” button in the upper right corner.
4. When asked for a public git repository, provide https://github.com/austinvach/spacecam and click “Import”.
    - The import process will take a minute or two to complete.
5. Once the import is completed, select “Invocations” > “Skill Invocation Name” from the left-hand menu and update the invocation name from “change me”.
6. Click “Build Model” to save and rebuild your model. Once the rebuild completes, move on to the next section.

## Update Alexa Client Secret and ID

1. Select "Tools" > "Permissions" from the left-hand menu, scroll down to the bottom of the page, and copy the "Alexa Client Id" and "Alexa Client Secret" to a temporary location.
2. Go to the "Code" tab, and replace [ALEXA_CLIENT_ID](/lambda/index.js#L12) and [ALEXA_CLIENT_SECRET](/lambda/index.js#L13) with your own values on lines 11-12 in [index.js](/lambda/index.js#L11-L12).
3. Once all the variables have been updated, click “Deploy” to save and deploy the changes.

## Enable Skill Testing

1. Go to the “Test” tab, click the drop down, and select “Development” to enable testing for your skill.

## View Your Widget

1. Go back to the “Build” tab, click “Multimodal Responses” from the left-hand navigation. Then select “Widget” from the section in the middle of the screen. At this point you should see a list showing one “apod” widget.
2. Click “Edit” to open the “apod” widget it in the authoring tool.
    - Note: "apod” uses the [widget responsive templates](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/responsive-templates.html) which are designed to be responsive across different screen sizes/viewports.

## Send to Device

1. Assuming you have an Echo Show 8, 10, or 15, select any of those devices from the drop down list at the bottom of the screen, switch from “Preview” to “Install”, and click “Send to Device” to install the widget on that device.
    - Note: You will see a placeholder appear in the [Favorite Widgets Panel](https://us.amazon.com/gp/help/customer/display.html?nodeId=GGVNRBH8CKP9PRC2) on the device you sent your widget to and within a few seconds the “apod” widget should appear in that location.
    
## Test Data Store Push
1. Say “Alexa, ask \<SKILL INVOCATION NAME\> to update the widget”. If the background of your widget changes from the default starry sky to [NASA’s picture of the day](https://apod.nasa.gov/apod/), everything is working as expected!

## Congratulations!

As a next step, familiarize yourself with the backend code (visible from the “Code” section of the Developer Console) to learn how to handle the most common events in a widget’s lifecycle and reference [Amazon's technical documentation](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/about-widgets-and-apl.html) for more information.
