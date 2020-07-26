import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import eks = require('@aws-cdk/aws-eks');
import iam = require('@aws-cdk/aws-iam');
import codebuild = require('@aws-cdk/aws-codebuild');
import codecommit = require('@aws-cdk/aws-codecommit');
import targets = require('@aws-cdk/aws-events-targets');
import { KubernetesVersion } from '@aws-cdk/aws-eks';
import { ComputeType, LocalCacheMode } from '@aws-cdk/aws-codebuild';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Uncomment below if you perfer using default VPC
     */
/*    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      isDefault: true
    })*/

    /**
     * Create a new VPC with single NAT Gateway
     */
    const vpc = new ec2.Vpc(this, 'NewVPC', {
      cidr: '10.100.0.0/16',
      natGateways: 1
    })

    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal()
    });

    const cluster = new eks.Cluster(this, 'Cluster', {
      vpc,
      defaultCapacity: 2,
      mastersRole: clusterAdmin,
      outputClusterName: true,
      version: KubernetesVersion.V1_16
    });

    const ecrRepo = new ecr.Repository(this, 'EcrRepo')

    const repository = new codecommit.Repository(this, 'CodeCommitRepo', {
      repositoryName: `${this.stackName}-repo`
    })

    const project = new codebuild.Project(this, 'MyProject', {
      projectName: `${this.stackName}`,
      source: codebuild.Source.codeCommit({ repository }),
      cache: codebuild.Cache.local(LocalCacheMode.DOCKER_LAYER, LocalCacheMode.CUSTOM),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromAsset(this, 'CustomImage', {
          directory: '../dockerAssets.d',
        }),
        computeType: ComputeType.LARGE,
        privileged: true,
      },
      environmentVariables: {
        'CLUSTER_NAME': {
          value: `${cluster.clusterName}`
        },
        'ECR_REPO_URI': {
          value: `${ecrRepo.repositoryUri}`
        }
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: [
            "curl -sS -o inline_scan.sh https://download.sysdig.com/stable/inline_scan.sh",
            "chmod +x inline_scan.sh"
            ]
          },
          pre_build: {
            commands: [
              'env',
              'export TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION}',
              '/usr/local/bin/entrypoint.sh'
            ]
          },
          build: {
            commands: [
              'cd flask-docker-app',
              `docker build -t $ECR_REPO_URI:$TAG .`,
              '$(aws ecr get-login --no-include-email)',
              'cd ..',
              `./inline_scan.sh analyze -s https://secure.sysdig.com -k <SYSDIG_KEY> -P $ECR_REPO_URI:$TAG > $TAG.txt || true`,
              'grep \"status is pass\" -iq $TAG.txt && echo \"Image scan passed\" && exit 0 || echo \"Image scan failed\" && exit 1',
              'docker push $ECR_REPO_URI:$TAG',
            ]
          },
          post_build: {
            commands: [
              'echo $CODEBUILD_BUILD_SUCCEEDING | grep 0 -q && exit 1 || exit 0',
              'kubectl get no',
              'kubectl set image deployment flask flask=$ECR_REPO_URI:$TAG'
            ]
          }
        }
      })
    })

    repository.onCommit('OnCommit', {
      target: new targets.CodeBuildProject(codebuild.Project.fromProjectArn(this, 'OnCommitEvent', project.projectArn))
    });

    ecrRepo.grantPullPush(project.role!)
    cluster.awsAuth.addMastersRole(project.role!)
    project.addToRolePolicy(new iam.PolicyStatement({
      actions: ['eks:DescribeCluster'],
      resources: [`${cluster.clusterArn}`],
    }))

    new cdk.CfnOutput(this, 'CodeCommitRepoName', { value: `${repository.repositoryName}` })
    new cdk.CfnOutput(this, 'CodeCommitRepoArn', { value: `${repository.repositoryArn}` })
    new cdk.CfnOutput(this, 'CodeCommitCloneUrlSsh', { value: `${repository.repositoryCloneUrlSsh}` })
    new cdk.CfnOutput(this, 'CodeCommitCloneUrlHttp', { value: `${repository.repositoryCloneUrlHttp}` })
  }
}
