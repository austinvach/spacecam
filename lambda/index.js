// sets up dependencies
const AWS = require("aws-sdk");
const axios = require("axios");
const Alexa = require("ask-sdk-core");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

// REPLACE THE PLACEHOLDERS WITH YOUR OWN INFO:
// ALEXA_CLIENT_ID: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.
// ALEXA_CLIENT_SECRET: Find yours at the bottom of https://developer.amazon.com/alexa/console/ask/build/permissions-v2/SKILL_ID/development/en_US - replacing SKILL_ID with your own.

const AlexaClientID = "ALEXA_CLIENT_ID";
const AlexaClientSecret = "ALEXA_CLIENT_SECRET";
const APODKey = "DEMO_KEY"; // Get your API Key at https://api.nasa.gov/#signUp.

// WIDGET SPECIFIC HANDLERS

// Triggered when the customer installs the widget. 
const InstallWidgetRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UsagesInstalled"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    async handle(handlerInput) {
        console.log("InstallWidgetRequestHandler handle");
        
        const request = handlerInput.requestEnvelope.request;
        const deviceID = handlerInput.requestEnvelope.context.System.device.deviceId;
        const attributesManager = handlerInput.attributesManager;
        var attributes = await attributesManager.getPersistentAttributes() || {};
        
        if (!Array.isArray(attributes.devices) || !attributes.devices.includes(deviceID)) {
            attributes.devices = [ ...(attributes.devices || []), deviceID];
            attributesManager.setPersistentAttributes(attributes);
            await attributesManager.savePersistentAttributes()
        }
        
        console.log("Installed to Device " + deviceID);

        return handlerInput.responseBuilder
            .withShouldEndSession(true)
            .getResponse();
    },
};

// Triggered when the widget is removed/uninstalled.
const RemoveWidgetRequestHandler = {
    canHandle(handlerInput) {
        // console.log("RemoveWidgetRequestHandler canHandle");
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.DataStore.PackageManager.UpdateRequest"
            && handlerInput.requestEnvelope.request.packageId !== null;
    },
    async handle(handlerInput) {
        console.log("RemoveWidgetRequestHandler handle");
        
        const request = handlerInput.requestEnvelope.request;
        const deviceID = handlerInput.requestEnvelope.context.System.device.deviceId;
        const attributesManager = handlerInput.attributesManager;
        var attributes = await attributesManager.getPersistentAttributes() || {};
        
        // Remove the device from the array if the widget has been removed.
        if(Array.isArray(attributes.devices) || attributes.devices.includes(deviceID)){
            attributes.devices = attributes.devices.filter(item => item !== deviceID); 
            attributesManager.setPersistentAttributes(attributes);
            await attributesManager.savePersistentAttributes();
        }

        console.log("Removed from Device " + deviceID);

        // Update and remove the device ID from userID attribute
        return handlerInput.responseBuilder
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
        const deviceID = handlerInput.requestEnvelope.context.System.device.deviceId;

        var speakOutput = '';
        
        const [ apiResponse, tokenResponse ] = await Promise.all([ getLatestPicture(), getAccessToken() ]);

        let config = {
            method: "post",
            url: `https://api.amazonalexa.com/v1/datastore/commands`,
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `${tokenResponse.token_type} ${tokenResponse.access_token}`
            },
            data : {
                "commands": [
                    {
                        "type": "PUT_OBJECT",
                        "namespace": "myNamespace",
                        "key": "myKey",
                        "content": {
                            "imageSource": apiResponse.url
                        }
                    }
                ],
                "target": {
                    "type": "DEVICES",
                    "items": [
                        deviceID
                    ]
                }
            }
        };
        
        let response = await axios(config);
        
        switch (response.data.results[0].type) {
            case 'SUCCESS':
                speakOutput = 'The target device received the payload.';
                break;
            
            case 'INVALID_DEVICE':
                speakOutput = 'The target device isn\'t capable of processing the payload. For example, the target device doesn\'t support the data store.';
                break;
            
            case 'DEVICE_UNAVAILABLE':
                speakOutput = 'The dispatch failed because the device is offline. When the commands operation sets the attemptDeliveryUntil property, Alexa attempts to redeliver the commands when the device is back online. You can use the query operation to get the status of this attempted delivery.';
                break;
            
            case 'DEVICE_PERMANENTLY_UNAVAILABLE':
                speakOutput = 'The dispatch failed because the device is no longer available. For example, this error occurs when the target device is no longer registered.';
                break;

            case 'CONCURRENCY_ERROR':
                speakOutput = 'There were multiple, concurrent attempts to update the same data store region. You can use the query operation to get the status of the attempted delivery before you attempt to send a new commands request.';
                break;

            case 'INTERNAL_ERROR':
                speakOutput = 'The dispatch failed because of an unknown error.';
                break;

            case 'PENDING_REQUEST_COUNT_EXCEEDS_LIMIT':
                speakOutput = 'The count of pending requests exceeds the limit.';
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
        speakOutput = `The picture for ${response.date} is called ${response.title}. Tap the screen to learn more about this picture.`
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
                            img: response.url,
                            title: response.title,
                            properties: {
                                exp: response.explanation
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

// API call to get the latest picture from NASA APOD. Get your API Key at https://api.nasa.gov/#signUp.
// APOD Docs - https://github.com/nasa/apod-api
// Axios Docs - https://axios-http.com/docs/api_intro
function getLatestPicture(){
     var config = {
            method: "get",
            timeout: 3000,
            url: "https://api.nasa.gov/planetary/apod",
            params: {
                api_key: APODKey
            }
    };
    
    return axios(config)
    .then(function (response){
      console.log(JSON.stringify(response.data));
      return response.data;
    })
    .catch(function (error){
      console.log(error)
    });
}

// Gets Access Token with the scope alexa::datastore. Used later to push to datastore.
function getAccessToken(){
    let OAuthConfig = {
            method: "post",
            url: "https://api.amazon.com/auth/o2/token",
            timeout: 3000,
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
    return axios(OAuthConfig)
    .then(function (response){
      console.log(JSON.stringify(response.data));
      return response.data;
    })
    .catch(function (error){
      console.log(error)
    });
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
