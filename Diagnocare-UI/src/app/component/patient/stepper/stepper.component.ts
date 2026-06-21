import { CommonModule } from '@angular/common';
import {Component, Input, OnInit} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

interface Step {
  id: number;
  title: string;
  description?: string;
}

@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.component.html',
  styleUrls: ['./stepper.component.scss'],
  standalone: true,
  imports: [CommonModule]
})


export class StepperComponent implements OnInit{

  @Input() steps: Step[] = [];
  @Input() currentStep: number = 1;

  firstFormGroup: FormGroup = new FormGroup({});
  secondFormGroup: FormGroup = new FormGroup({});
  thirdFormGroup: FormGroup = new FormGroup({});

  ngOnInit(): void {
    this.firstFormGroup = new FormGroup({
      firstCtrl: new FormControl('',Validators.required),
    }),
    this.secondFormGroup = new FormGroup({
      secondCtrl: new FormControl('',Validators.required),
    })
    this.thirdFormGroup = new FormGroup({
      thirdCtrl: new FormControl('',Validators.required),
    })
    
  }
  
}
