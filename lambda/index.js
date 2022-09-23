// sets up dependencies
const AWS = require("aws-sdk");
const axios = require("axios");
const Alexa = require("ask-sdk-core");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

// REPLACE THE PLACEHOLDERS WITH YOUR OWN INFO:
// SKILL_ID: Find yours in the Alexa Developer Console: https://developer.amazon.com/alexa/console/ask
// ALEXA_CLIENT_ID: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.
// ALEXA_CLIENT_SECRET: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.

const AlexaClientID = "ALEXA_CLIENT_ID";
const AlexaClientSecret = "ALEXA_CLIENT_SECRET";
const SkillID = "SKILL_ID";
const SkillStage = "development";
const APODKey = "DEMO_KEY"; // Get your API Key at https://api.nasa.gov/#signUp.

// WIDGET SPECIFIC HANDLERS

// Triggered when the customer installs the widget. 
const InstallWidgetRequestHandler = {
    canHandle(handlerInput) {
        // console.log("InstallWidgetRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.InstallRequest"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    async handle(handlerInput) {
        console.log("InstallWidgetRequestHandler handle");
        
        const request = handlerInput.requestEnvelope.request;
        const deviceID = handlerInput.requestEnvelope.context.System.device.deviceId;
        const attributesManager = handlerInput.attributesManager;
        var attributes = await attributesManager.getPersistentAttributes() || {};
        
        // If there are no existing devices, create a devices array and save to attributes. Else update the devices array with the device ID.
        if(attributes.hasOwnProperty('devices') === false){
            attributes = Object.assign({"devices":[deviceID]});
        } else {
            attributes.devices.push(deviceID);
        }
        
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        const installPackageDirective = {
            type: "Alexa.DataStore.PackageManager.InstallPackage",
            dataStorePackage: {
                packageVersion: "1.1",
                packageType: "WIDGET",
                manifest: {
                    type: "Link",
                    src: `package://alexa/datastore/packages/${request.packageId}/manifest.json`,
                },
                content: {
                    document: {
                        type: "Link",
                        src: `package://alexa/datastore/packages/${request.packageId}/document.json`,
                    },
                    datasources: {
                        type: "Link",
                        src: `package://alexa/datastore/packages/${request.packageId}/datasources/default.json`,
                    }
                }
            }
        };
        
        const speakOutput = `Installing the ${request.packageId} widget`;
        
        return handlerInput.responseBuilder
            .addDirective(installPackageDirective)
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    },
};

// Triggered when the widget is removed/uninstalled.
const RemoveWidgetRequestHandler = {
    canHandle(handlerInput) {
        // console.log("RemoveWidgetRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.PackageRemoved"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    async handle(handlerInput) {
        console.log("RemoveWidgetRequestHandler handle");
        
        const request = handlerInput.requestEnvelope.request;
        const deviceID = handlerInput.requestEnvelope.context.System.device.deviceId;
        const attributesManager = handlerInput.attributesManager;
        var attributes = await attributesManager.getPersistentAttributes() || {};
        
        // Remove the device from the array if the widget has been removed.
        attributes.devices = attributes.devices.filter(item => item !== deviceID); 
        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();

        const speakOutput = `The ${request.packageId} widget has been removed.`;

        // Update and remove the device ID from userID attribute
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

const WidgetEventHandler = {
    canHandle(handlerInput) {
        // console.log("WidgetEventHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent";
        // If your widget has more than one button, you'll want to check
        // the event source ID to determine which button triggered the event.
        // e.g. return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.APL.UserEvent" && handlerInput.requestEnvelope.request.source.id === 'sourceID';
    },
    handle(handlerInput) {
        // console.log("WidgetEventHandler handle");
        // Since I want my skill to launch when the widget is tapped I'm
        // just returning the LaunchRequestHandler's handle function.
        return LaunchRequestHandler.handle(handlerInput);
    },
};

const UpdateWidgetIntentHandler = {
    canHandle(handlerInput) {
        // console.log("UpdateWidgetIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "UpdateWidget";
    },
    async handle(handlerInput) {
        console.log("UpdateWidgetIntentHandler handle");
        const userID = handlerInput.requestEnvelope.context.System.user.userId;

        var speakOutput = '';
        
        // Prepping the first API call to get NASA's astromony picture of the day (APOD).
        let apiResponse = await getLatestPicture();
        let tokenResponse = await getAccessToken();
        
        // Prepping the third API call to push data to the widget.
        let config = {
            method: "post",
            url: `https://api.amazonalexa.com/v1/datastore/${SkillID}_${SkillStage}/executeCommands`,
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `${tokenResponse.data.token_type} ${tokenResponse.data.access_token}`
            },
            data : {
                "commands": [
                    {
                        "type": "PutObject",
                        "namespace": "myNamespace",
                        "key": "myKey",
                        "content": {
                            "imageSource": apiResponse.data.url
                        }
                    }
                ],
                "targets": [
                    {
                        "type": "USER_ID",
                        "targetId": userID
                    }
                ]
            }
        };
        
        let response = await axios(config);
        
        switch (response.data.dispatchResults[0].code) {
            case 'SUCCESS':
                speakOutput = 'The widget was successfully updated.';
                break;
            
            case 'INVALID_TARGET':
                speakOutput = 'The target was invalid.';
                break;
            
            case 'TARGET_UNAVAILABLE':
                speakOutput = 'The device is offline and hence an update was not pushed.';
                break;
            
            case 'INTERNAL_ERROR':
                speakOutput = 'The dispatch failed because of an unknown error.';
                break;
        
            default:
                speakOutput = 'The widget was successfully updated.';
                break;
        }
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    },
};

// STANDARD HANDLERS

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        // console.log("LaunchRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
    },
    async handle(handlerInput) {
        // console.log("LaunchRequestHandler handle");
        
        var speakOutput = "";

        var response = await getLatestPicture();
        speakOutput = `The picture for ${response.data.date} is called ${response.data.title}. Tap the screen to learn more about this picture.`

        // Check if the user's device supports APL. If yes, send an APL response.
        if (Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)["Alexa.Presentation.APL"]) {
            // Add the RenderDocument directive to the response
            handlerInput.responseBuilder
                .addDirective({
                    type: "Alexa.Presentation.APL.RenderDocument",
                    document: {
                        src: "doc://alexa/apl/documents/launch",
                        type: "Link",
                    },
                    datasources: {
                        apod: {
                            img: response.data.url,
                            title: response.data.title,
                            properties: {
                                exp: response.data.explanation
                            },
                            transformers: [
                                {
                                    inputPath: "exp",
                                    outputName: "expSpeech",
                                    transformer: "textToSpeech",
                                }
                            ]
                        }
                    }
                }
            );
        } else {
            speakOutput = "This skill shows images from NASA. Try launching this skill on a device with a screen.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        // console.log("HelpIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent";
    },
    handle(handlerInput) {
        // console.log("HelpIntentHandler handle");
        const speakOutput = "You can say hello to me! How can I help?";

        return handlerInput.responseBuilder.speak(speakOutput).reprompt(speakOutput).getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        // console.log("CancelAndStopIntentHandler canHandle");
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
                && (Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.CancelIntent"
                || Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.StopIntent")
        );
    },
    handle(handlerInput) {
        // console.log("CancelAndStopIntentHandler handle");
        const speakOutput = "Goodbye!";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        // console.log("FallbackIntentHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.FallbackIntent";
    },
    handle(handlerInput) {
        // console.log("FallbackIntentHandler handle");
        const speakOutput = "Sorry, I don't know about that. Please try again.";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        // console.log("SessionEndedRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "SessionEndedRequest";
    },
    handle(handlerInput) {
        // console.log("SessionEndedRequestHandler handle");
        console.log(`=== SESSION ENDED: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder
            .getResponse(); // notice we send an empty response
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        // console.log("IntentReflectorHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest";
    },
    handle(handlerInput) {
        // console.log("IntentReflectorHandler handle");
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return (
            handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse()
        );
    }
};

const ErrorHandler = {
    canHandle() {
        // console.log("ErrorHandler canHandle");
        return true;
    },
    handle(handlerInput, error) {
        // console.log("ErrorHandler handle");
        const speakOutput = "Sorry, I had trouble doing what you asked. Please try again.";
        console.log(`=== ERROR HANDLED: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// API call to get the latest picture from NASA APOD. 
// APOD Docs - https://github.com/nasa/apod-api
// Axios Docs - https://axios-http.com/docs/api_intro
function getLatestPicture(){
     var config = {
            method: "get",
            timeout: 1000,
            url: "https://api.nasa.gov/planetary/apod",
            params: {
                api_key: APODKey
            }
    };
    
    return axios(config);
}

// Gets Access Token with the scope alexa::datastore. Used later to push to datastore.
function getAccessToken(){
    let OAuthConfig = {
            method: "post",
            url: "https://api.amazon.com/auth/o2/token",
            timeout: 1000,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "charset": "utf-8",
            },
            params: {
                grant_type: "client_credentials",
                client_id: AlexaClientID,
                client_secret: AlexaClientSecret,
                scope: "alexa::datastore"
            }
        };
    return axios(OAuthConfig);
}

// REQUEST INTERCEPTORS

const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log(`=== INCOMING SKILL REQUEST: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    }
};

// RESPONSE INTERCEPTORS

const LoggingResponseInterceptor = {
    process(handlerInput, response) {
        console.log(`=== OUTGOING SKILL RESPONSE: ${JSON.stringify(response)}`);
    }
};

//  This handler acts as the entry point for your skill, routing all request and response
//  payloads to the handlers above. Make sure any new handlers or interceptors you've
//  defined are included below. The order matters - they're processed top to bottom

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        InstallWidgetRequestHandler,
        UpdateWidgetIntentHandler,
        RemoveWidgetRequestHandler,
        WidgetEventHandler,
        LaunchRequestHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler
    )
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(LoggingRequestInterceptor)
    .addResponseInterceptors(LoggingResponseInterceptor)
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        })
    )
    .lambda();
