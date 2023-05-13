import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as stepfunction from 'aws-cdk-lib/aws-stepfunctions';
//import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from "fs";

export class CdkStepFunctionsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create a step function

    //create a roleARN for step function
    const roleARN = new iam.Role(this, 'StepFunctionRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
      ]
    });

    const file = fs.readFileSync('./logic/workflow.asl.json', 'utf8');
    
    const cdfnStepFunction=new stepfunction.CfnStateMachine(this, 'cdfnStepFunction',
    {
      roleArn: roleARN.roleArn,
      definitionString: file.toString(),
    });

    //DynamoDB table definition
    const table = new dynamodb.Table(this, "OrdersTable", {
      partitionKey: {name:"id", type: dynamodb.AttributeType.STRING}
    });

    //create a step function
    const stepFuncStarter = new lambda.Function(this, "StepFuncHandler", {
      runtime: lambda.Runtime.NODEJS_16_X,
      code: lambda.Code.fromAsset("./src"),
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        PRIMARY_KEY:'id',
        STEPFUNCTION_ARN: cdfnStepFunction.attrArn
      },
    });
    
    //permisos a la funcion lambda para insertar en la tabla dynamodb
    table.grantReadWriteData(stepFuncStarter);
    stepFuncStarter.addToRolePolicy(new iam.PolicyStatement({
      actions: ["states:StartExecution"],
      resources: [cdfnStepFunction.attrArn]
    }));


    
    //create a api gateway
    const api = new apigateway.RestApi(this, "StepFuncApi", {
      restApiName: "StepFuncApi",
      description: "StepFuncApi",
      endpointTypes: [apigateway.EndpointType.REGIONAL]
    });

    //add api gateway resource
    const resource = api.root.addResource("orders");
    const stepFuncIntegration = new apigateway.LambdaIntegration(stepFuncStarter);
    resource.addMethod("POST", stepFuncIntegration);
     


  }
}
