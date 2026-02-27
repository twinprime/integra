export type DiagramType = 'sequence-diagram' | 'use-case-diagram';

export interface FunctionParam {
  name: string;
  type: string;
}

export interface InterfaceFunction {
  id: string;
  name: string;
  params: FunctionParam[];
  returnType?: string;
}

export interface ComponentInterface {
  id: string;
  name: string;
  functions: InterfaceFunction[];
}

export interface UseCase {
  id: string;
  name: string;
}

export interface ComponentNode {
  uuid: string;
  id: string;
  name: string;
  type: 'root' | 'component';
  children: ComponentNode[];
  interfaces: ComponentInterface[];
  useCases: UseCase[];
  diagramSpec: string;
  diagramType: DiagramType;
  ownerComponentUuid?: string;
}
